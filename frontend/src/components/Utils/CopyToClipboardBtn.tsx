import React from 'react';
import { Snackbar } from '@mui/material'
import { useState } from 'react'
import { FaShareNodes } from "react-icons/fa6";
import '../../assets/style/Playground.css';
import { useAtom } from 'jotai';
import { permalinkAtom } from '../../atoms';




const CopyToClipboardBtn = () => {
  const [open, setOpen] = useState(false);
  const [snackbarPosition, setSnackbarPosition] = useState<{ vertical: 'top' | 'bottom'; horizontal: 'left' | 'center' | 'right' }>({ vertical: 'top', horizontal: 'center' });
  const [snackbarMessage, setSnackbarMessage] = useState('Copied to clipboard');
  const [permalink] = useAtom(permalinkAtom);

  /**
   * @function handleCopyClick
   * @description Copy the permalink to the clipboard. 
   * @todo Change the URL to the deployed URL
  */
  const handleCopyClick = async () => {
    try {
      setOpen(true)
      await navigator.clipboard.writeText(`${window.location.origin}/?check=${permalink.check}&p=${permalink.permalink}`)
    } catch (err) {
      setSnackbarMessage('Failed to copy to clipboard')
    }
  }

  const handleSnackbarClose = () => {
    setOpen(false);
  };

  return (
    <>
      <FaShareNodes
        role='button'
        className='playground-icon'
        onClick={handleCopyClick}
      />

      {/* Show a snackbar when the permalink is copied to the clipboard */}
      <Snackbar
        anchorOrigin={snackbarPosition}
        open={open}
        onClose={handleSnackbarClose}
        autoHideDuration={2000}
        message={snackbarMessage}
      />
    </>
  )
}

export default CopyToClipboardBtn