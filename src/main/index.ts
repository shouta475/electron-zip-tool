/// <reference types="electron-vite/node" />
import { dialog, app, shell, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'child_process'
import path, { join } from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { extractFull } from 'node-7z'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import * as SevenBin from '7zip-bin'
import loadWasm from '../../resources/wasm/zipcheck.wasm?loader'
import jschardet from 'jschardet'
import * as iconv from 'iconv-lite'
import log from 'electron-log'

log.info('Starting Electron app...');
// ログファイルのパス
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
    icon: join(__dirname, '../../resources/zip-tool-icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // DevToolsを開く
  if (is.dev) {
    console.log("open DevTools");
    mainWindow.webContents.openDevTools()
  }

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

app.whenReady().then(async () => {
  // テスト
  const tmpDir = os.tmpdir();
  const now = new Date().toISOString();
  const files = await fsp.readdir(tmpDir);
  log.info(`${now} [Startup Scan] Temporary files in ${tmpDir}: ${files.join(', ')}`);
  for (const file of files) {
    if (file.startsWith('extract-')) {
      const fullPath = path.join(tmpDir, file);
      const stat = await fsp.stat(fullPath);
      log.info(`${file} created at ${stat.birthtime.toISOString()}`);
    }
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron.zip-tool')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  if (is.dev) {
    global.fileToOpen = '/Users/kimurashouta/Desktop/work/zip tool/test-zipfiles/icons.zip'
  }

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
  global.fileToOpen = filePath;
  log.info(`File to open: ${filePath}`);
})

ipcMain.handle('load-zip-entries', async () => {
  if (!global.fileToOpen) return []
  // wasmでリスト取得
  const resultList = await loadWasm()
    .then((instance) => {
      // メモリ解放用の関数を取得
      const free = instance.exports.free as (ptr: number, len: number) => void
      const freeJsonResult = instance.exports.free_json_result as (ptr: number) => void
      // wasmのメモリーにZIPファイルの内容を読み込む
      const memory = instance.exports.memory as WebAssembly.Memory
      const zipBuffer = fs.readFileSync(global.fileToOpen)
      const alloc = instance.exports.alloc as (len: number) => number
      const ptr = alloc(zipBuffer.length)
      new Uint8Array(memory.buffer).set(zipBuffer, ptr)
      const list_zip_entries = instance.exports.list_zip_entries as (
        ptr: number,
        len: number
      ) => number
      // list_zip_entries関数を呼び出してZIPのリスト情報のJSONを取得
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
      log.error(`wasm error: ${err}`);
      return [];
    })
  return resultList
})

ipcMain.handle('get-file-content', async (_event, filePath, password) => {
  // node-7zでファイルを開く
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const tempDir: string = path.join(os.tmpdir(), `extract-${timestamp}-from-zip-tool-${uuidv4()}`)
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
      log.error(`Extract error: ${err}`);
    }

    const errors: string[] = []

    stream.on('end', async () => {
      const extractedFilePath = path.join(tempDir, filePath)
      try {
        const buffer = await fsp.readFile(extractedFilePath)
        const detection = jschardet.detect(buffer)
        const encoding = detection.encoding
        const confidence = detection.confidence

        let content: string
        // 信頼度が高く、テキストと判断できる場合のみ decode
        if (encoding && confidence > 0.9) {
          content = iconv.decode(buffer, encoding)
        } else {
          reject(new Error('バイナリファイルまたは文字コードの検出に失敗しました'))
          return
        }
        resolve(content)
      } catch (e) {
        reject(new Error(`ファイルの読み取りに失敗しました: ${e}`))
        log.error(`File read error: ${e}`);
      } finally {
        await fsp.rm(tempDir, { recursive: true, force: true }).catch((err) => {
          log.error(`Temp directory cleanup error: ${err}`);
        })
      }
    })
    stream.on('error', (err: any) => {
      reject(new Error(`解凍に失敗しました: ${err}`));
      log.error(`Node-7z open error: ${err}`);
      // エラー時も一時ファイル削除
      fsp.rm(tempDir, { recursive: true, force: true }).catch((err) => {
        log.error(`Temp directory cleanup error: ${err}`);
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
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tempDir: string = path.join(os.tmpdir(), `extract-${timestamp}-from-zip-tool-${uuidv4()}`);
  await fsp.mkdir(tempDir, { recursive: true });

  const normalizedFilePath = process.platform === 'darwin' ? filePath.normalize('NFD') : filePath
  const fullTempFilePath = path.join(tempDir, normalizedFilePath)
  await fsp.mkdir(path.dirname(fullTempFilePath), { recursive: true })
  await fsp.writeFile(fullTempFilePath, inputVal, 'utf-8')

  return new Promise((resolve, reject) => {
    const args = [
      'a', // add
      '-scsUTF-8',
      path.resolve(global.fileToOpen),
      normalizedFilePath, // 相対パスで追加（cwdが起点）
      `-p${password}`, // パスワード
      '-y' // 全てに「Yes」
    ]
    let proc
    try {
      const unpacked7za = SevenBin.path7za.replace('app.asar', 'app.asar.unpacked')
      proc = spawn(unpacked7za, args, {
        cwd: tempDir // filePath のルートを tempDir にする
      })
    } catch (err) {
      log.error(`Update error: ${err}`);
      // エラー時も削除
      fsp.rm(tempDir, { recursive: true, force: true }).catch((e) => {
        log.error(`Temp directory cleanup error: ${e}`);
        reject(err)
        return
      })
    }

    proc.stdout.on('data', (_data) => {

    })

    proc.stderr.on('data', (_data) => {
    })

    proc.on('close', (code) => {
      // 常にtempDirを削除する
      fsp
        .rm(tempDir, { recursive: true, force: true })
        .catch((_e) => {
          log.error(`Temp directory cleanup error: ${_e}`);
        })
      if (code === 0) {
        resolve('')
      } else {
        reject(new Error(`更新に失敗しました: exit code ${code}`))
      }
    })
  })
})
