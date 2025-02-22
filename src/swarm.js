import React, { useEffect, useState, useContext, createContext } from 'react'
import Hyperswarm from 'hyperswarm'
import { useDHT } from './dht.js'

const SwarmContext = createContext()

export const Swarm = ({ children, ...options }) => {
  const { dht } = useDHT()
  const [swarm, setSwarm] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!dht) return

    const swarm = new Hyperswarm({
      keyPair: dht.defaultKeyPair,
      ...options,
      dht
    })

    const onReady = () => setReady(true)
    swarm.on('ready', onReady)
    setSwarm(swarm)

    return () => {
      swarm.off('ready', onReady)
      swarm.destroy()
      setReady(false)
      for (const socket of swarm.connections) socket.destroy()
    }
  }, [dht])

  return React.createElement(
    SwarmContext.Provider,
    { value: { swarm, ready } },
    children
  )
}

export const useSwarm = () => {
  const context = useContext(SwarmContext)

  if (context === undefined) {
    throw new Error('useSwarm must be used within a Swarm component')
  }

  return context
}

export const useReplicate = (core, enable = true, deps = []) => {
  const [ready, setReady] = useState(false)
  const { swarm } = useSwarm()

  useEffect(() => {
    if (core) core.ready().then(() => setReady(true))
    return () => setReady(false)
  }, [core])

  useEffect(() => {
    if (!enable || !swarm || !ready || core?.closed) return

    const onConnection = socket => {
      core.replicate(socket)
    }

    const done = core.findingPeers()
    swarm.on('connection', onConnection)
    swarm.join(core.discoveryKey, { server: false, client: true })
    swarm.flush().then(done, done)

    for (const socket of swarm.connections) {
      core.replicate(socket)
    }

    return () => {
      swarm.off('connection', onConnection)
      swarm.leave(core.discoveryKey)

      for (const socket of swarm.connections) socket.destroy()
    }
  }, [swarm, core, ready, enable, ...deps])

  return { swarm, core }
}
