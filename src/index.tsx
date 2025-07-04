import { createRoot } from 'react-dom/client'
import 'tailwindcss/tailwind.css'
import App from 'components/App'
import { initializeSecurity } from 'lib/security'

// Initialize security measures
initializeSecurity()

const container = document.getElementById('root') as HTMLDivElement
const root = createRoot(container)

root.render(<App />)
