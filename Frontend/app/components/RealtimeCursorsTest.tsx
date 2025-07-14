'use client'

import { RealtimeCursors } from './realtime-cursors'
import { useState, useEffect } from 'react'

/**
 * Test component to verify realtime cursors functionality
 * Use this in a separate page or overlay to test cursor sharing
 */
export const RealtimeCursorsTest = () => {
  const [testUser, setTestUser] = useState({
    name: 'Test User',
    projectId: 'test-project-123'
  })
  const [isConnected, setIsConnected] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const generateRandomName = () => {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']
    const randomName = names[Math.floor(Math.random() * names.length)]
    setTestUser(prev => ({ ...prev, name: randomName }))
  }

  const generateRandomProject = () => {
    const projectId = `test-project-${Math.floor(Math.random() * 1000)}`
    setTestUser(prev => ({ ...prev, projectId }))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Realtime Cursors Test</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">User Name</label>
            <input
              type="text"
              value={testUser.name}
              onChange={(e) => setTestUser(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter your name"
            />
            <button
              onClick={generateRandomName}
              className="mt-1 text-sm text-blue-600 hover:underline"
            >
              Generate Random Name
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Project ID</label>
            <input
              type="text"
              value={testUser.projectId}
              onChange={(e) => setTestUser(prev => ({ ...prev, projectId: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter project ID"
            />
            <button
              onClick={generateRandomProject}
              className="mt-1 text-sm text-blue-600 hover:underline"
            >
              Generate Random Project
            </button>
          </div>

          <div className="bg-gray-50 p-3 rounded-md">
            <h3 className="font-medium mb-2">Current Status</h3>
            <div className="text-sm space-y-1">
              <div>Name: <span className="font-mono">{testUser.name}</span></div>
              <div>Project: <span className="font-mono">{testUser.projectId}</span></div>
              <div>Mouse: <span className="font-mono">({mousePosition.x}, {mousePosition.y})</span></div>
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded-md">
            <h3 className="font-medium mb-2 text-blue-800">How to Test</h3>
            <div className="text-sm text-blue-700 space-y-1">
              <div>1. Open this page in another browser/tab</div>
              <div>2. Use different names but same project ID</div>
              <div>3. Move your mouse around</div>
              <div>4. You should see each other's cursors!</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Reload Page
          </button>
        </div>
      </div>

      {/* The actual realtime cursors component */}
      <RealtimeCursors
        roomName={`project-${testUser.projectId}`}
        username={testUser.name}
        throttleMs={50}
        staleTimeout={5000}
      />
    </div>
  )
} 