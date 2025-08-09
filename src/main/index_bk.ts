/// <reference types="electron-vite/node" />
import { dialog, app, shell, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'child_process'
import path, { join } from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { extractFull } from 'node-7z'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import { electronApp, is } from '@electron-toolkit/utils'
import * as SevenBin from '7zip-bin'
import loadWasm from '../../resources/zipcheck.wasm?loader'

// ログをユーザーのドキュメントフォルダに書き出す
const logPath = join(app.getPath('documents'), 'zip-tool-log.txt')
fs.appendFileSync(logPath, `\n`)
fs.appendFileSync(logPath, `: ${new Date().toISOString()} \n`)
fs.appendFileSync(logPath, `7z binary path: ${SevenBin.path7za}\n`)

global.fileToOpen = null

type ZipListEntry = {
  is_encrypted: boolean
  is_file: boolean
  path: string
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 常にDevToolsを開く
  mainWindow.webContents.openDevTools()

  // ウィンドウ表示はレンダラ側の初期処理完了を待ってから
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // ウィンドウ内でリンククリックされたときに、外部ブラウザで開く（新規ウィンドウ防止）
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Viteの開発サーバ or 本番HTMLをロード
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron.zip-tool')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  // app.on('browser-window-created', (_, window) => {
  //   optimizer.watchWindowShortcuts(window)
  // })

  if (global.fileToOpen) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

// 受信したファイルを開く
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (global.fileToOpen !== null) {
    dialog.showMessageBox({
      type: 'warning',
      message: 'すでに別のZIPファイルを開いています。先に閉じてください。'
    })
    return
  }
  // 保存しておいて、あとでウィンドウに渡す
  global.fileToOpen = filePath
  fs.appendFileSync(logPath, `lobal.fileToOpen: ${global.fileToOpen}\n`)
})

ipcMain.handle('load-zip-entries', async () => {
  fs.appendFileSync(logPath, `load-zip-entries!`)
  if (!global.fileToOpen) return []
  // wasmでリスト取得
  const resultList = await loadWasm()
    .then((instance) => {
      fs.appendFileSync(logPath, `loadWasm!`)
      // メモリ解放用の関数を取得
      const free = instance.exports.free as (ptr: number, len: number) => void
      const freeJsonResult = instance.exports.free_json_result as (ptr: number) => void
      // wasmのメモリーにZIPファイルの内容を読み込む
      const memory = instance.exports.memory as WebAssembly.Memory
      const zipBuffer = fs.readFileSync(global.fileToOpen)
      const alloc = instance.exports.alloc as (len: number) => number
      const ptr = alloc(zipBuffer.length)
      new Uint8Array(memory.buffer).set(zipBuffer, ptr)
      // list_zip_entries関数を呼び出してZIPのリスト情報のJSONを取得
      const list_zip_entries = instance.exports.list_zip_entries as (
        ptr: number,
        len: number
      ) => number
      const resultPtr = list_zip_entries(ptr, zipBuffer.length)
      const resultView = new DataView(memory.buffer, resultPtr, 8)
      const jsonPtr = resultView.getUint32(0, true) // little endian
      const jsonLen = resultView.getUint32(4, true)
      const jsonBytes = new Uint8Array(memory.buffer, jsonPtr, jsonLen)
      const jsonStr = new TextDecoder('utf-8').decode(jsonBytes)
      const entries = JSON.parse(jsonStr)
      const resultList = entries.filter(
        (e: ZipListEntry) => !e.path.startsWith('__MACOSX') && e.is_file
      )
      // メモリを解放
      free(jsonPtr, jsonLen)
      free(ptr, zipBuffer.length)
      freeJsonResult(resultPtr)
      return resultList
    })
    .catch((err) => {
      fs.appendFileSync(logPath, `wasm error: ${err}\n`)
      return []
    })
  return resultList
})

ipcMain.handle('get-file-content', async (_event, filePath, password) => {
  // node-7zでファイルを開く
  const tempDir: string = path.join(os.tmpdir(), `extract-${uuidv4()}`)
  await fsp.mkdir(tempDir, { recursive: true })
  return new Promise((resolve, reject) => {
    let stream: any
    try {
      const unpacked7za = SevenBin.path7za.replace('app.asar', 'app.asar.unpacked')
      stream = extractFull(global.fileToOpen, tempDir, {
        password,
        $bin: unpacked7za,
        $cherryPick: [filePath]
      })
    } catch (err) {
      fs.appendFileSync(logPath, `extractFull error : ${err} \n`)
      fs.appendFileSync(logPath, `global.fileToOpen : ${global.fileToOpen} \n`)
      fs.appendFileSync(logPath, `SevenBin.path7za : ${SevenBin.path7za} \n`)
      fs.appendFileSync(logPath, `tempDir : ${tempDir} \n`)
    }

    const errors: string[] = []

    stream.on('end', async () => {
      const extractedFilePath = path.join(tempDir, filePath)
      try {
        const content = await fsp.readFile(extractedFilePath, 'utf-8')
        fs.appendFileSync(logPath, `resolved\n`)
        resolve(content)
      } catch (e) {
        reject(new Error(`ファイルの読み取りに失敗しました: ${e}`))
        fs.appendFileSync(logPath, `node-7z open error: ${e}\n`)
      } finally {
        // 一時ファイルを削除
        fsp.rm(tempDir, { recursive: true, force: true }).catch((err) => {
          fs.appendFileSync(logPath, `tempDir cleanup error: ${err}\n`)
        })
      }
    })

    stream.on('error', (err: any) => {
      reject(new Error(`解凍に失敗しました: ${err}`))
      fs.appendFileSync(logPath, `node-7z open error: ${err}\n`)
      // エラー時も一時ファイル削除
      fsp.rm(tempDir, { recursive: true, force: true }).catch((err) => {
        fs.appendFileSync(logPath, `tempDir cleanup error: ${err}\n`)
      })
    })

    stream.on('data', (data) => {
      if (data.status === 'error') {
        errors.push(data.file)
      }
    })
  })
})

ipcMain.handle('update-file-content', async (_event, filePath, inputVal, password) => {
  const tempDir: string = path.join(os.tmpdir(), `extract-${uuidv4()}`)
  await fsp.mkdir(tempDir, { recursive: true })

  const normalizedFilePath = process.platform==='darwin'? filePath.normalize('NFD') : filePath;
  const fullTempFilePath = path.join(tempDir, normalizedFilePath)
  fs.appendFileSync(logPath, `fullTempFilePath : ${fullTempFilePath} \n`)
  await fsp.mkdir(path.dirname(fullTempFilePath), { recursive: true })
  await fsp.writeFile(fullTempFilePath, inputVal, 'utf-8')

  return new Promise((resolve, reject) => {
    const args = [
      'a', // add
      '-scsUTF-8',
      path.resolve(global.fileToOpen), // 絶対パス指定（上書き）
      normalizedFilePath, // 相対パスで追加（cwdが起点）
      `-p${password}`, // パスワード
      '-y', // 全てに「Yes」
    ]
    let proc
    try {
      const unpacked7za = SevenBin.path7za.replace('app.asar', 'app.asar.unpacked')
      proc = spawn(unpacked7za, args, {
        cwd: tempDir // filePath のルートを tempDir にする
      })
    } catch (err) {
      fs.appendFileSync(logPath, `update error : ${err} \n`)
      // エラー時も削除
      fsp.rm(tempDir, { recursive: true, force: true }).catch((e) => {
        fs.appendFileSync(logPath, `tempDir cleanup error (spawn failed): ${e}\n`)
        reject(err)
        return
      })
    }

    proc.stdout.on('data', (data) => {
      fs.appendFileSync(logPath, `stdout: ${data}`)
    })

    proc.stderr.on('data', (data) => {
      fs.appendFileSync(logPath, `stderr: ${data}`)
    })

    proc.on('close', (code) => {
      // 常にtempDirを削除する
      fsp
        .rm(tempDir, { recursive: true, force: true })
        .then(() => {
          // fs.appendFileSync(logPath, `tempDir deleted: ${tempDir}\n`)
        })
        .catch((_e) => {
          // fs.appendFileSync(logPath, `tempDir cleanup error: ${e}\n`)
        })
      if (code === 0) {
        fs.appendFileSync(logPath, `resolved\n`)
        resolve('')
      } else {
        reject(new Error(`更新に失敗しました: exit code ${code}`))
      }
    })
  })
})
