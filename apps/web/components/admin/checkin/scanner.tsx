import React from 'react'

// Admin scanner UI scaffold for JK-025
// - Presents a camera/scanner input
// - Submits scanned token to admin scanner API
// - Shows minimal masked response (checked-in / already used / invalid / wrong event)
// - Accessible, mobile-first layout

export default function Scanner() {
  return (
    <div className="admin-checkin-scanner">
      <h1>Check-in Scanner (Admin)</h1>
      <p className="muted">Use the camera or paste a token. Scanner UI scaffold (JK-025).</p>

      <form onSubmit={(e) => { e.preventDefault(); alert('Not implemented') }}>
        <label htmlFor="token">Scanned token or paste</label>
        <input id="token" name="token" type="text" placeholder="Paste token or scan" />
        <button type="submit">Lookup / Check in</button>
      </form>

      <section aria-live="polite" className="result" />
    </div>
  )
}
