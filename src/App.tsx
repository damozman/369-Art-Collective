import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">247 Print Network</h1>
        <p className="text-xl mb-8">API LIVE</p>
        <button
          onClick={() => setCount(count + 1)}
          className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Count: {count}
        </button>
      </div>
    </div>
  )
}

export default App