import React, { useEffect, useReducer, useRef } from 'react'
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
  Snackbar,
  InputAdornment,
  IconButton
} from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import { PasswordDialog } from './components/PasswordDialog'
import { ListSelectDialog } from './components/ListSelectDialog'
import { ZipFileEntry, Severity } from './types/types'
import SearchIcon from '@mui/icons-material/Search'

// --- Types ---
type State = {
  fileList: ZipFileEntry[]
  inputVal: string
  passwordValue: string
  clickedFile: ZipFileEntry | null
  selectedFile: ZipFileEntry | null
  passwordDialogOpen: boolean
  listSelectDialogOpen: boolean
  isEditing: boolean
  searchValue: string
  snackbarList: SnackbarData[]
}

type SnackbarData = {
  id: string
  message: string
  severity: 'success' | 'info' | 'warning' | 'error'
}

type Action =
  | { type: 'SET_FILE_LIST'; payload: ZipFileEntry[] }
  | { type: 'SET_INPUT_VAL'; payload: string }
  | { type: 'SET_PASSWORD_VAL'; payload: string }
  | { type: 'SET_SELECTED_FILE'; payload: ZipFileEntry | null }
  | { type: 'SET_CLICKED_FILE'; payload: ZipFileEntry | null }
  | { type: 'TOGGLE_PASSWORD_DIALOG'; payload: boolean }
  | { type: 'TOGGLE_LIST_DIALOG'; payload: boolean }
  | { type: 'SET_EDITING'; payload: boolean }
  | { type: 'SET_SEARCH_VALUE'; payload: string }
  | { type: 'ADD_SNACKBAR'; payload: SnackbarData }
  | { type: 'REMOVE_SNACKBAR'; payload: string }

const initialState: State = {
  fileList: [],
  inputVal: '',
  passwordValue: '',
  clickedFile: null,
  selectedFile: null,
  passwordDialogOpen: false,
  listSelectDialogOpen: false,
  isEditing: false,
  searchValue: '',
  snackbarList: []
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_FILE_LIST':
      return { ...state, fileList: action.payload }
    case 'SET_INPUT_VAL':
      return { ...state, inputVal: action.payload, isEditing: true }
    case 'SET_PASSWORD_VAL':
      return { ...state, passwordValue: action.payload }
    case 'SET_SELECTED_FILE':
      return { ...state, selectedFile: action.payload }
    case 'SET_CLICKED_FILE':
      return { ...state, clickedFile: action.payload }
    case 'TOGGLE_PASSWORD_DIALOG':
      return { ...state, passwordDialogOpen: action.payload }
    case 'TOGGLE_LIST_DIALOG':
      return { ...state, listSelectDialogOpen: action.payload }
    case 'SET_EDITING':
      return { ...state, isEditing: action.payload }
    case 'SET_SEARCH_VALUE':
      return { ...state, searchValue: action.payload }
    case 'ADD_SNACKBAR':
      return {
        ...state,
        snackbarList: [...state.snackbarList, action.payload]
      }
    case 'REMOVE_SNACKBAR':
      return {
        ...state,
        snackbarList: state.snackbarList.filter((s) => s.id !== action.payload)
      }
    default:
      return state
  }
}

function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    window.electron.ipcRenderer.invoke('load-zip-entries').then((list) => {
      dispatch({ type: 'SET_FILE_LIST', payload: list })
    })
  }, [])

  // アラート追加関数
  const addSnackBar = (severity: Severity, message: string) => {
    const newSnackBarData = { id: crypto.randomUUID(), severity, message }
    dispatch({ type: 'ADD_SNACKBAR', payload: newSnackBarData })
  }

  const getFileContent = (file: ZipFileEntry, password: string | null = null) => {
    if (!file.path) return
    window.electron.ipcRenderer
      .invoke('get-file-content', file.path, password)
      .then((contents) => {
        dispatch({ type: 'SET_INPUT_VAL', payload: contents })
        dispatch({ type: 'SET_EDITING', payload: false })
        dispatch({ type: 'SET_SELECTED_FILE', payload: file })
      })
      .catch((error) => {
        addSnackBar('error', 'コンテンツの取得に失敗しました。')
        console.error(error)
      })
  }

  const handleListItemOnClick = (clickedFile: ZipFileEntry) => {
    if (clickedFile.path === state.selectedFile?.path) return
    dispatch({ type: 'SET_CLICKED_FILE', payload: clickedFile })
    if (state.isEditing) {
      dispatch({ type: 'TOGGLE_LIST_DIALOG', payload: true })
    } else {
      clickedFile.is_encrypted
        ? dispatch({ type: 'TOGGLE_PASSWORD_DIALOG', payload: true })
        : getFileContent(clickedFile)
    }
  }

  const passwordDialogOnSubmit = () => {
    getFileContent(state.clickedFile!, state.passwordValue)
  }

  const listSelectDialogOnSubmit = () => {
    const file = state.clickedFile
    if (!file?.path) return
    file.is_encrypted
      ? dispatch({ type: 'TOGGLE_PASSWORD_DIALOG', payload: true })
      : getFileContent(file)
  }

  const updateReq = () => {
    window.electron.ipcRenderer
      .invoke('update-file-content', state.selectedFile?.path, state.inputVal, state.passwordValue)
      .then(() => {
        addSnackBar('success', 'ファイルを更新しました。')
        dispatch({ type: 'SET_EDITING', payload: false })
      })
      .catch((error) => {
        addSnackBar('error', 'ファイルの更新に失敗しました。')
        console.error(error)
      })
  }

  const isEditable = (filename: string) => /\.(txt|md|json)$/i.test(filename.trim())

  // 検索機能
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const handleSearchIconClick = () => {
    const textarea = textAreaRef.current
    const scrollBox = boxRef.current;
    if (!textarea || !scrollBox) return
    const content = state.inputVal
    const query = state.searchValue
    if (!query) return
    const currentPos = textarea.selectionEnd ?? 0
    const nextIndexRaw = content.indexOf(query, currentPos)
    const adjustIndex = (rawIndex: number): number => {
      // content.slice(0, rawIndex) に含まれる \r の数をカウント
      const before = content.slice(0, rawIndex);
      const numCR = (before.match(/\r/g) || []).length;
      return rawIndex - numCR;
    };
    const scrollToMatch = (rawIndex: number) => {
      const adjustedIndex = adjustIndex(rawIndex);
      textarea.focus()
      textarea.setSelectionRange(adjustedIndex, adjustedIndex + query.length)
      // スクロール処理：改行数 × 行の高さ（lineHeight）
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight || '20')
      const linesAbove = content.slice(0, adjustedIndex).split('\n').length - 1
      scrollBox.scrollTop = linesAbove * lineHeight
    }
    if (nextIndexRaw !== -1) {
      scrollToMatch(nextIndexRaw)
    } else {
      // 先に進めなかった場合、先頭から再検索（ループ検索的）
      const restartIndex = content.indexOf(query)
      if (restartIndex !== -1) {
        scrollToMatch(restartIndex)
      } else {
        // 一致なし
        dispatch({
          type: 'ADD_SNACKBAR',
          payload: {
            id: crypto.randomUUID(),
            severity: 'info',
            message: '次の一致は見つかりませんでした'
          }
        })
      }
    }
  }

  return (
    <>
      <h1>ZIP Tool</h1>
      <p>ZIPファイルを開いて中身を表示・編集するツールです。</p>
      <p>注意：更新するとUTF-8に上書きされます。</p>

      {/* ポップアップメッセージ表示 */}
      {state.snackbarList &&
        state.snackbarList.map((snack) => (
          <Snackbar
            open
            autoHideDuration={3000}
            sx={{ width: '100%' }}
            onClose={() => dispatch({ type: 'REMOVE_SNACKBAR', payload: snack.id })}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          >
            <Alert
              onClose={() => dispatch({ type: 'REMOVE_SNACKBAR', payload: snack.id })}
              severity={snack.severity}
            >
              {snack.message}
            </Alert>
          </Snackbar>
        ))}
      {/* メイン */}
      <Box display="flex" sx={{ height: '100%', padding: '10px' }}>
        <Box flexGrow={1} overflow="auto">
          <List>
            {state.fileList.map((file) => (
              <ListItem disablePadding key={file.path}>
                <ListItemButton
                  selected={file.path === state.selectedFile?.path}
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
          flexGrow={3}
          sx={{ height: '60vh', display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          {/* 更新ボタン */}
          <Box display="flex" justifyContent="flex-end" mb={1} sx={{ paddingRight: '10px' }}>
            <Button variant="contained" onClick={updateReq} disabled={!state.isEditing}>
              更新
            </Button>
          </Box>
          {/* 検索フォーム */}
          <Box
            sx={{ display: 'flex', justifyContent: 'start', width: '100%', paddingRight: '10px' }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder="検索ワードを入力"
              value={state.searchValue}
              onChange={(e) => dispatch({ type: 'SET_SEARCH_VALUE', payload: e.target.value })}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={handleSearchIconClick}>
                      <SearchIcon sx={{ fontSize: '35px' }} />
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
          </Box>
          {/* 入力エリア */}
          <Box
            sx={{
              height: '100%',
              flexGrow: 1,
              overflow: 'auto',
              paddingTop: '10px',
              border: '1px solid #ccc'
            }}
            ref={boxRef}
          >
            <TextField
              fullWidth
              multiline
              disabled={!state.selectedFile?.path}
              sx={{
                '& fieldset': {
                  border: 'none'
                },
                '& textarea': {
                  overflowX: 'auto',
                  whiteSpace: 'pre'
                }
              }}
              value={state.inputVal}
              onChange={(e) => dispatch({ type: 'SET_INPUT_VAL', payload: e.target.value })}
              inputRef={textAreaRef}
            />
          </Box>
        </Box>
      </Box>

      <PasswordDialog
        open={state.passwordDialogOpen}
        onClose={() => dispatch({ type: 'TOGGLE_PASSWORD_DIALOG', payload: false })}
        onSubmit={passwordDialogOnSubmit}
        passwordValue={state.passwordValue}
        setPasswordValue={(val) => dispatch({ type: 'SET_PASSWORD_VAL', payload: val })}
      />

      <ListSelectDialog
        open={state.listSelectDialogOpen}
        onClose={() => dispatch({ type: 'TOGGLE_LIST_DIALOG', payload: false })}
        onSubmit={listSelectDialogOnSubmit}
      />
    </>
  )
}

export default App
