import React from 'react'
import './LoadingScreen.css'

export default function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      <span>Chargement...</span>
    </div>
  )
}
