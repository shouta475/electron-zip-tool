import React, { useEffect, useState } from 'react'
import {
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Box,
  TextField,
  Button,
  Alert,
  ListItemButton,
  Snackbar
} from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import { PasswordDialog } from './components/PasswordDialog'
import { ListSelectDialog } from './components/ListSelectDialog'
import { ZipFileEntry, AlertData, Severity } from './types/types'

function App(): React.JSX.Element {
  const [fileList, setFileList] = useState<ZipFileEntry[]>([])
  useEffect(() => {
    window.electron.ipcRenderer.invoke('load-zip-entries').then((list) => {
      setFileList(list)
    })
  }, [])

  // アラート関連
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const addAlert = (severity: Severity, message: string) => {
    const newAlert = { id: crypto.randomUUID(), severity, message }
    setAlerts((prev) => [...prev, newAlert])
  }
  const deleteAlert = (id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id))
  }

  const [inputVal, setInputVal] = useState<string>('')
  const [passwordValue, setPasswordValue] = useState<string>('')
  const [clickedFile, setClickedFile] = useState<ZipFileEntry | null>(null)
  const [selectedFile, setSelectedFile] = useState<ZipFileEntry | null>(null)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState<boolean>(false)
  const [isEditing, setIsEditing] = useState<boolean>(false) // 編集モードの状態
  const [listSelectDialogOpen, setListSelectDialogOpen] = useState<boolean>(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)

  const getFileContent = (filePath: string, password: string | null = null) => {
    if (!filePath) return;
    console.log(`password: ${password}`);
    window.electron.ipcRenderer
      .invoke('get-file-content', filePath, password)
      .then((contents) => {
        console.log("getFile成功")
        setInputVal(contents); // 取得したコンテンツを入力欄にセット
        setIsEditing(false); // コンテンツ取得後は編集モードを解除
        setSelectedFile(clickedFile); // 確認後に選択を更新
      })
      .catch((error) => {
        addAlert('error', 'コンテンツの取得に失敗しました。');
        console.error(error);
      })
  }
  const handleListItemOnClick = (file: ZipFileEntry) => {
    // クリックされたファイルを一時記録
    setClickedFile(file);
    if (isEditing) {
      // 編集中に選択を変更する場合は確認ダイアログを表示
      setListSelectDialogOpen(true);
    } else {
      if (file.is_encrypted) {
        setPasswordDialogOpen(true);
      } else {
        getFileContent(file.path);
      }
    }
  }
  const handleListItemOnClickAfterDialog = (clickedFile: ZipFileEntry) => {
    if (clickedFile.is_encrypted) {
      setPasswordDialogOpen(true);
    } else {
      getFileContent(clickedFile.path);
    }
  }

  const passwordDialogOnSubmit = () => {
    getFileContent(clickedFile?.path as string, passwordValue);
  }

  const updateReq = () => {
    window.electron.ipcRenderer
      .invoke('update-file-content', selectedFile?.path, inputVal, passwordValue)
      .then(() => {
        setSnackbarOpen(true);
        // addAlert('success', 'ファイルの内容を更新しました。')
        setIsEditing(false); // 更新後は編集モードを解除
      })
      .catch((error) => {
        addAlert('error', 'ファイルの更新に失敗しました。')
        console.error(error)
      })
  }
  const isEditable = (filename: string) => /\.(txt|md|json)$/i.test(filename.trim())

  return (
    <>
      <h1>ZIP Tool</h1>
      <p>ZIPファイルを開いて中身を表示・編集するツールです。</p>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        sx={{ width: '100%' }}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" sx={{ width: '100%' }}>
          ファイルを更新しました
        </Alert>
      </Snackbar>
      {alerts?.map((alert) => (
        <Alert key={alert.id} severity={alert.severity} onClose={() => deleteAlert(alert.id)}>
          {alert.message}
        </Alert>
      ))}
      <Box display="flex" sx={{ height: '100%', padding: '10px' }}>
        <Box flexGrow={1} overflow="auto">
          <List>
            {fileList.map((file) => (
              <ListItem disablePadding key={file.path}>
                <ListItemButton
                  selected={file.path === selectedFile?.path}
                  onClick={() => handleListItemOnClick(file)}
                  disabled={!isEditable(file.path)}
                >
                  {file.is_encrypted && (
                    <ListItemIcon>
                      <LockIcon />
                    </ListItemIcon>
                  )}
                  <ListItemText primary={file.path} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
        <Box
          flexGrow={2}
          sx={{
            height: '60vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <Box display="flex" justifyContent="flex-end" mb={1} sx={{ paddingRight: '10px' }}>
            <Button variant="contained" onClick={updateReq} disabled={!isEditing}>
              更新
            </Button>
          </Box>
          <Box sx={{ height: '100%', overflow: 'auto', paddingTop: '10px' }}>
            <TextField
              label="ファイル内容"
              fullWidth
              multiline
              sx={{
                flexGrow: 1,
                '& .MuiInputBase-root': {
                  height: '100%',
                  alignItems: 'flex-start',
                  overflow: 'auto'
                },
                '& .MuiOutlinedInput-root': {
                  minHeight: '100%',
                  alignItems: 'start'
                }
              }}
              variant="outlined"
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value)
                if (!isEditing) {
                  setIsEditing(true) // 入力があれば編集モードにする
                }
              }}
            />
          </Box>
        </Box>
      </Box>
      <PasswordDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
        onSubmit={passwordDialogOnSubmit}
        passwordValue={passwordValue}
        setPasswordValue={setPasswordValue}
      />
      <ListSelectDialog
        open={listSelectDialogOpen}
        onClose={() => setListSelectDialogOpen(false)}
        onSubmit={() => {
          handleListItemOnClickAfterDialog(clickedFile as ZipFileEntry)
        }}
      />
    </>
  )
}

export default App
