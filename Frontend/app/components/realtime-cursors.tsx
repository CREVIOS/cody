'use client'

import { useRealtimeCursors } from '@/hooks/use-realtime-cursors'
import { Cursor } from './cursor'

type RealtimeCursorsProps = {
  roomName: string
  username: string
  throttleMs?: number
  staleTimeout?: number
}

export const RealtimeCursors = ({ 
  roomName, 
  username, 
  throttleMs = 50,
  staleTimeout = 5000
}: RealtimeCursorsProps) => {
  const { cursors } = useRealtimeCursors({
    roomName,
    username,
    throttleMs,
    staleTimeout,
  })

  return (
    <>
      {Object.entries(cursors).map(([userId, cursor]) => (
        <Cursor
          key={userId}
          className="absolute z-50 transition-all duration-100 ease-out"
          style={{
            left: cursor.position.x,
            top: cursor.position.y,
            transform: 'translate(-50%, -50%)',
          }}
          color={cursor.color}
          name={cursor.user.name}
        />
      ))}
    </>
  )
}
