import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from '@mui/material'

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: () => void
}

export const ListSelectDialog: React.FC<Props> = ({ open, onClose, onSubmit }) => {
  const handleSubmit = () => {
    onSubmit() // 親へ渡す
    onClose() // ダイアログを閉じる
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm" // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false
      fullWidth // 横幅を広げる
    >
      <DialogTitle>注意</DialogTitle>
      <DialogContent>編集中に選択を変更すると編集内容が失われます。よろしいですか？</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSubmit}>OK</Button>
      </DialogActions>
    </Dialog>
  )
}
