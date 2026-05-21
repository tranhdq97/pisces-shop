import { Navigate } from 'react-router-dom'

/** Tables ops moved into Orders (dine-in mode). Keep route for old bookmarks. */
export default function Tables() {
  return <Navigate to="/orders?mode=dine_in" replace />
}
