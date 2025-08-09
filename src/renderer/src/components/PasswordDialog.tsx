import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  IconButton,
  InputAdornment,
  DialogActions,
  Button
} from '@mui/material'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import '../assets/styles/shake.css' // CSSファイルでshakeアニメーションを定義

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: () => void
  passwordValue: string
  setPasswordValue: (value: string) => void
}

export const PasswordDialog: React.FC<Props> = ({
  open,
  onClose,
  onSubmit,
  passwordValue,
  setPasswordValue
}) => {
  const [showPassword, setShowPassword] = useState(false)
  const [isShaking, setIsShaking] = useState(false)

  const handleSubmit = () => {
    if (passwordValue.trim() === '') {
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 500)
      return
    }
    onSubmit() // コンテンツ取得処理
    onClose() // ダイアログを閉じる
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose()
      }}
      maxWidth="sm" // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false
      fullWidth // 横幅を広げる
    >
      <DialogTitle className={isShaking ? 'shake' : ''}>パスワードを入力してください</DialogTitle>
      <DialogContent className={isShaking ? 'shake' : ''}>
        <TextField
          label="パスワード"
          type={showPassword ? 'text' : 'password'}
          value={passwordValue}
          onChange={(e) => setPasswordValue(e.target.value)}
          fullWidth
          autoFocus
          margin="dense"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault() // フォーム送信や予期せぬ動作を防ぐ
              handleSubmit()
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowPassword((show) => !show)}
                  edge="end"
                  aria-label="パスワードの表示切替"
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            )
          }}
        />
      </DialogContent>
      <DialogActions className={isShaking ? 'shake' : ''}>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSubmit}>OK</Button>
      </DialogActions>
    </Dialog>
  )
}
