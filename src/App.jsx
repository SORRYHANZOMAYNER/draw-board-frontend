import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import BoardPage from './pages/BoardPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/board/:roomId" element={<BoardPage />} />
      </Routes>
    </BrowserRouter>
  )
}