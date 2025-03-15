import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FaMicrophone, FaMicrophoneSlash, FaSignOutAlt, FaUsers, FaVolumeUp, FaVolumeMute, FaLink, FaCopy, FaSearch, FaQrcode, FaBug } from 'react-icons/fa';
import { useChatContext } from '../context/ChatContext';
import './AudioLobby.css';

interface AudioLobbyProps {
  onClose: () => void;
  lobbyId?: string;
}

// Peer connection manager for fully client-side mesh network
class P2PMeshNetwork {
  private static instance: P2PMeshNetwork;
  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private localStream: MediaStream | null = null;
  private peerId: string;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private connectedPeers: Set<string> = new Set();
  private lobbyId: string | null = null;
  private username: string | null = null;
  
  private constructor() {
    // Generate a random peer ID
    this.peerId = Math.random().toString(36).substring(2, 15);
    
    // Listen for connection requests via URL hash
    window.addEventListener('hashchange', this.handleHashChange);
    this.handleHashChange();
    
    // Set up periodic presence broadcasting
    setInterval(() => {
      if (this.lobbyId) {
        this.broadcastPresence();
      }
    }, 5000); // Broadcast every 5 seconds
  }
  
  public static getInstance(): P2PMeshNetwork {
    if (!P2PMeshNetwork.instance) {
      P2PMeshNetwork.instance = new P2PMeshNetwork();
    }
    return P2PMeshNetwork.instance;
  }
  
  public getPeerId(): string {
    return this.peerId;
  }
  
  public setLobbyId(lobbyId: string): void {
    this.lobbyId = lobbyId;
    
    // Set up signaling
    this.setupLocalStorageSignaling();
    
    // Broadcast initial presence
    setTimeout(() => {
      this.broadcastPresence();
    }, 500);
  }
  
  public getLobbyId(): string | null {
    return this.lobbyId;
  }
  
  public setLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    
    // Add stream to existing connections
    this.connections.forEach(pc => {
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          if (this.localStream) {
            pc.addTrack(track, this.localStream);
          }
        });
      }
    });
  }
  
  public getConnectedPeers(): string[] {
    return Array.from(this.connectedPeers);
  }
  
  public createInviteLink(): string {
    if (!this.lobbyId) {
      throw new Error("Lobby ID not set");
    }
    
    const url = new URL(window.location.href);
    // Clear any existing hash
    url.hash = '';
    // Create a new URL object to ensure we have the base URL without hash
    const baseUrl = new URL(url.toString());
    // Add the join parameters
    baseUrl.hash = `join=${this.lobbyId}:${this.peerId}`;
    return baseUrl.toString();
  }
  
  private handleHashChange = (): void => {
    const hash = window.location.hash;
    if (hash.startsWith('#join=')) {
      const params = hash.substring(6).split(':');
      if (params.length === 2) {
        const [lobbyId, peerId] = params;
        
        if (peerId && peerId !== this.peerId) {
          // Set the lobby ID if not already set
          if (!this.lobbyId) {
            this.lobbyId = lobbyId;
            this.emit('lobby-joined', { lobbyId });
          }
          
          // Connect to the peer
          this.connectToPeer(peerId, true);
          
          // Clear the hash after connecting
          history.pushState("", document.title, window.location.pathname + window.location.search);
        }
      }
    }
  }
  
  public broadcastPresence(): void {
    if (!this.lobbyId) return;
    
    try {
      console.log(`Broadcasting presence in lobby: ${this.lobbyId}`);
      
      const presenceMessage = {
        type: 'presence',
        sender: this.peerId,
        username: this.username || `User-${this.peerId.substring(0, 4)}`,
        timestamp: Date.now(),
        lobbyId: this.lobbyId
      };
      
      // Store in localStorage with a unique key
      const key = `signal-${this.lobbyId}-${this.peerId}-presence-${Date.now()}`;
      localStorage.setItem(key, JSON.stringify(presenceMessage));
      
      // Also try broadcast channel as a backup
      try {
        const broadcastChannel = new BroadcastChannel(`p2p-mesh-${this.lobbyId}`);
        broadcastChannel.postMessage(presenceMessage);
        setTimeout(() => broadcastChannel.close(), 100);
      } catch (e) {
        // Ignore broadcast channel errors
      }
    } catch (error) {
      console.error('Error broadcasting presence:', error);
    }
  }
  
  public scanForPeers(): Promise<string[]> {
    return new Promise((resolve) => {
      if (!this.lobbyId) {
        resolve([]);
        return;
      }
      
      console.log("Scanning for peers in lobby:", this.lobbyId);
      
      const foundPeers: string[] = [];
      
      // Broadcast our presence to any peers in the same lobby
      this.broadcastPresence();
      
      // Also check localStorage for recently active peers in this lobby
      try {
        const storedPeersJson = localStorage.getItem(`lobby-peers-${this.lobbyId}`);
        const timestamp = localStorage.getItem(`lobby-timestamp-${this.lobbyId}`);
        
        if (storedPeersJson && timestamp) {
          const storedPeers = JSON.parse(storedPeersJson) as string[];
          const lastActive = parseInt(timestamp);
          
          // Only use stored peers if they were active in the last 30 minutes
          if (Date.now() - lastActive < 30 * 60 * 1000) {
            storedPeers.forEach(peerId => {
              if (peerId !== this.peerId && !this.connections.has(peerId)) {
                this.connectToPeer(peerId, true);
                foundPeers.push(peerId);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error retrieving peers from localStorage:', error);
      }
      
      // Resolve after a short delay to allow for broadcast channel responses
      setTimeout(() => {
        resolve(foundPeers);
      }, 2000);
    });
  }
  
  public connectToPeer(peerId: string, isInitiator: boolean = false): void {
    if (this.connections.has(peerId)) {
      console.log(`Already connected to peer: ${peerId}`);
      return;
    }
    
    console.log(`Connecting to peer: ${peerId}, initiator: ${isInitiator}`);
    
    // Create a new RTCPeerConnection with optimized ICE server configuration
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Add a TURN server for NAT traversal in difficult network conditions
        {
          urls: 'turn:numb.viagenie.ca',
          username: 'webrtc@live.com',
          credential: 'muazkh'
        }
      ],
      iceCandidatePoolSize: 10
    });
    
    this.connections.set(peerId, pc);
    
    // Set up track event handler
    this.setupTrackEventHandler(pc, peerId);
    
    // Set up data channel for signaling
    if (isInitiator) {
      const dataChannel = pc.createDataChannel('signaling', {
        ordered: true // Ensure ordered delivery for signaling messages
      });
      this.setupDataChannel(dataChannel, peerId);
      
      // Create and send offer after a short delay to allow connection setup
      setTimeout(() => this.createAndSendOffer(pc, peerId), 500);
    } else {
      pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel, peerId);
      };
    }
    
    // Add local stream tracks to the connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        if (this.localStream) {
          console.log(`Adding ${track.kind} track to connection with ${peerId}`);
          pc.addTrack(track, this.localStream);
        }
      });
    } else {
      console.warn(`No local stream available when connecting to ${peerId}`);
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage(peerId, {
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };
    
    // Log ICE gathering state changes
    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering state for ${peerId}: ${pc.iceGatheringState}`);
    };
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state for ${peerId}: ${pc.connectionState}`);
      
      if (pc.connectionState === 'connected') {
        this.connectedPeers.add(peerId);
        this.emit('peer-connected', { peerId });
        
        // Store this peer in localStorage for future reconnections
        this.storePeerInLocalStorage(peerId);
        
        // Send mute state
        if (this.localStream) {
          const audioTrack = this.localStream.getAudioTracks()[0];
          if (audioTrack) {
            this.sendDataChannelMessage(peerId, {
              type: 'mute-change',
              userId: this.peerId,
              isMuted: !audioTrack.enabled
            });
          }
        }
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // Try to reconnect if the connection fails or disconnects
        setTimeout(() => {
          if (pc.connectionState !== 'connected' && pc.connectionState !== 'connecting') {
            console.log(`Attempting to reconnect to ${peerId}`);
            this.reconnectToPeer(peerId);
          }
        }, 2000);
      } else if (pc.connectionState === 'closed') {
        this.connectedPeers.delete(peerId);
        this.emit('peer-disconnected', { peerId });
      }
    };
  }
  
  private setupTrackEventHandler(pc: RTCPeerConnection, peerId: string): void {
    pc.ontrack = (event) => {
      console.log(`Received track from ${peerId}:`, event.track.kind);
      
      if (event.track.kind === 'audio' && event.streams && event.streams.length > 0) {
        // Store the remote stream reference
        const stream = event.streams[0];
        
        // Emit track event with the stream
        this.emit('track', { 
          peerId, 
          track: event.track, 
          streams: event.streams 
        });
        
        // Log track details
        console.log(`Audio track received from ${peerId}:`, {
          id: event.track.id,
          enabled: event.track.enabled,
          muted: event.track.muted,
          readyState: event.track.readyState
        });
        
        // Set up ended event handler
        event.track.onended = () => {
          console.log(`Track from ${peerId} ended`);
        };
        
        // Set up mute event handler
        event.track.onmute = () => {
          console.log(`Track from ${peerId} muted`);
          this.emit('mute-change', { userId: peerId, isMuted: true });
        };
        
        // Set up unmute event handler
        event.track.onunmute = () => {
          console.log(`Track from ${peerId} unmuted`);
          this.emit('mute-change', { userId: peerId, isMuted: false });
        };
      }
    };
  }
  
  private setupDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    this.dataChannels.set(peerId, dataChannel);
    
    dataChannel.onopen = () => {
      console.log(`Data channel opened with peer: ${peerId}`);
      
      // Send a ping message to verify the connection
      this.sendDataChannelMessage(peerId, {
        type: 'ping',
        timestamp: Date.now()
      });
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel closed with peer: ${peerId}`);
    };
    
    dataChannel.onerror = (error) => {
      console.error(`Data channel error with peer ${peerId}:`, error);
    };
    
    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        console.log(`Received message from peer ${peerId}:`, message.type);
        
        switch (message.type) {
          case 'offer':
            this.handleOffer(peerId, message.sdp);
            break;
          case 'answer':
            this.handleAnswer(peerId, message.sdp);
            break;
          case 'ice-candidate':
            this.handleIceCandidate(peerId, message.candidate);
            break;
          case 'ping':
            // Respond to ping with pong
            this.sendDataChannelMessage(peerId, {
              type: 'pong',
              timestamp: message.timestamp,
              responseTime: Date.now()
            });
            break;
          case 'pong':
            // Calculate round-trip time
            const rtt = Date.now() - message.timestamp;
            console.log(`Round-trip time to peer ${peerId}: ${rtt}ms`);
            break;
          case 'mute-change':
            this.emit('mute-change', message);
            break;
          case 'peer-list':
            // Connect to other peers in the mesh
            if (Array.isArray(message.peers)) {
              message.peers.forEach((otherPeerId: string) => {
                if (otherPeerId !== this.peerId && !this.connections.has(otherPeerId)) {
                  this.connectToPeer(otherPeerId, true);
                }
              });
            }
            break;
          default:
            console.log(`Unknown message type from peer ${peerId}: ${message.type}`);
        }
      } catch (error) {
        console.error(`Error handling message from peer ${peerId}:`, error);
      }
    };
  }
  
  private sendDataChannelMessage(peerId: string, message: any): void {
    try {
      const dataChannel = this.dataChannels.get(peerId);
      
      if (!dataChannel || dataChannel.readyState !== 'open') {
        console.warn(`Cannot send message to peer ${peerId}: data channel not open`);
        return;
      }
      
      dataChannel.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Error sending message to peer ${peerId}:`, error);
    }
  }
  
  private sendSignalingMessage(peerId: string, message: any): void {
    // Try to send via data channel if available
    const dataChannel = this.dataChannels.get(peerId);
    
    if (dataChannel && dataChannel.readyState === 'open') {
      this.sendDataChannelMessage(peerId, message);
      return;
    }
    
    // Fall back to localStorage for initial signaling
    try {
      if (!this.lobbyId) return;
      
      const signalMessage = {
        type: message.type,
        sender: this.peerId,
        recipient: peerId,
        timestamp: Date.now(),
        ...message
      };
      
      // Store in localStorage with a unique key
      const key = `signal-${this.lobbyId}-${this.peerId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem(key, JSON.stringify(signalMessage));
      
      console.log(`Signaling message sent via localStorage to ${peerId}: ${message.type}`);
      
      // Clean up old messages periodically
      if (Math.random() < 0.1) { // 10% chance to clean up
        this.cleanupSignalingMessages();
      }
    } catch (error) {
      console.error(`Error sending signaling message to peer ${peerId}:`, error);
    }
  }
  
  private async createAndSendOffer(pc: RTCPeerConnection, peerId: string): Promise<void> {
    try {
      // Create offer with proper constraints
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      };
      
      const offer = await pc.createOffer(offerOptions);
      
      // Set local description
      await pc.setLocalDescription(offer);
      
      // Wait for ICE gathering to complete
      if (pc.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve) => {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              resolve();
            } else {
              setTimeout(checkState, 100);
            }
          };
          checkState();
        });
      }
      
      // Send the offer with all ICE candidates included
      this.sendSignalingMessage(peerId, {
        type: 'offer',
        sdp: pc.localDescription
      });
      
      console.log(`Offer sent to peer: ${peerId}`);
    } catch (error) {
      console.error(`Error creating offer for peer ${peerId}:`, error);
      // Try to reconnect on failure
      setTimeout(() => this.reconnectToPeer(peerId), 2000);
    }
  }
  
  private async handleOffer(peerId: string, sdp: RTCSessionDescription): Promise<void> {
    try {
      console.log(`Received offer from peer: ${peerId}`);
      
      // Create a new connection if it doesn't exist
      if (!this.connections.has(peerId)) {
        this.connectToPeer(peerId, false);
      }
      
      const pc = this.connections.get(peerId);
      if (!pc) {
        throw new Error(`No peer connection for ${peerId}`);
      }
      
      // Set remote description
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      
      // Create answer
      const answer = await pc.createAnswer();
      
      // Set local description
      await pc.setLocalDescription(answer);
      
      // Wait for ICE gathering to complete
      if (pc.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve) => {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              resolve();
            } else {
              setTimeout(checkState, 100);
            }
          };
          checkState();
        });
      }
      
      // Send the answer with all ICE candidates included
      this.sendSignalingMessage(peerId, {
        type: 'answer',
        sdp: pc.localDescription
      });
      
      console.log(`Answer sent to peer: ${peerId}`);
    } catch (error) {
      console.error(`Error handling offer from peer ${peerId}:`, error);
    }
  }
  
  private async handleAnswer(peerId: string, sdp: RTCSessionDescription): Promise<void> {
    try {
      console.log(`Received answer from peer: ${peerId}`);
      
      const pc = this.connections.get(peerId);
      if (!pc) {
        throw new Error(`No peer connection for ${peerId}`);
      }
      
      // Set remote description
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      
      console.log(`Connection established with peer: ${peerId}`);
    } catch (error) {
      console.error(`Error handling answer from peer ${peerId}:`, error);
    }
  }
  
  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void> {
    try {
      console.log(`Received ICE candidate from peer: ${peerId}`);
      
      const pc = this.connections.get(peerId);
      if (!pc) {
        throw new Error(`No peer connection for ${peerId}`);
      }
      
      // Add the ICE candidate
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      
      console.log(`Added ICE candidate for peer: ${peerId}`);
    } catch (error) {
      console.error(`Error handling ICE candidate from peer ${peerId}:`, error);
    }
  }
  
  public broadcast(event: string, data: any, excludePeers: string[] = []): void {
    const message = {
      type: 'broadcast',
      event,
      data
    };
    
    this.dataChannels.forEach((dataChannel, peerId) => {
      if (!excludePeers.includes(peerId) && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(message));
      }
    });
    
    // Also emit locally
    this.emit(event, data);
  }
  
  public on(event: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.add(callback);
    }
    
    // Return unsubscribe function
    return () => {
      const currentListeners = this.listeners.get(event);
      if (currentListeners) {
        currentListeners.delete(callback);
      }
    };
  }
  
  public emit(event: string, data: any): void {
    if (!this.listeners.has(event)) {
      return; // No listeners for this event
    }
    
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in listener for event ${event}:`, error);
        }
      });
    }
  }
  
  public disconnect(): void {
    try {
      // Close all peer connections
      this.connections.forEach((pc, peerId) => {
        try {
          // Close data channel if it exists
          const dataChannel = this.dataChannels.get(peerId);
          if (dataChannel && dataChannel.readyState !== 'closed') {
            dataChannel.close();
          }
          
          // Close the peer connection
          if (pc.connectionState !== 'closed') {
            pc.close();
          }
        } catch (error) {
          console.error(`Error closing connection to peer ${peerId}:`, error);
        }
      });
      
      // Clear all collections
      this.connections.clear();
      this.dataChannels.clear();
      this.connectedPeers.clear();
      
      // Stop all tracks in the local stream
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }
      
      // Emit disconnected event
      this.emit('disconnected', {});
      
      console.log('Disconnected from mesh network');
    } catch (error) {
      console.error('Error disconnecting from mesh network:', error);
    }
  }
  
  // Add a reconnection method
  private reconnectToPeer(peerId: string): void {
    // Close the existing connection
    const existingConnection = this.connections.get(peerId);
    if (existingConnection) {
      existingConnection.close();
      this.connections.delete(peerId);
    }
    
    // Remove data channel
    this.dataChannels.delete(peerId);
    
    // Try to establish a new connection
    this.connectToPeer(peerId, true);
  }
  
  // Add a method to store peers in localStorage
  private storePeerInLocalStorage(peerId: string): void {
    if (!this.lobbyId) return;
    
    try {
      // Get existing peers
      const storedPeersJson = localStorage.getItem(`lobby-peers-${this.lobbyId}`);
      let peers: string[] = storedPeersJson ? JSON.parse(storedPeersJson) : [];
      
      // Add the new peer if not already in the list
      if (!peers.includes(peerId)) {
        peers.push(peerId);
        localStorage.setItem(`lobby-peers-${this.lobbyId}`, JSON.stringify(peers));
      }
      
      // Update timestamp
      localStorage.setItem(`lobby-timestamp-${this.lobbyId}`, Date.now().toString());
    } catch (error) {
      console.error('Error storing peer in localStorage:', error);
    }
  }
  
  // Add a method to share the list of connected peers
  public sharePeerList(peerId: string): void {
    const connectedPeers = Array.from(this.connectedPeers);
    
    this.sendDataChannelMessage(peerId, {
      type: 'peer-list',
      peers: connectedPeers
    });
  }
  
  public setUsername(username: string): void {
    this.username = username;
  }
  
  private setupLocalStorageSignaling(): void {
    if (!this.lobbyId) return;
    
    // Set up storage event listener for cross-tab communication
    window.addEventListener('storage', this.handleStorageEvent);
    
    // Clean up old messages
    this.cleanupSignalingMessages();
    
    console.log('LocalStorage signaling initialized');
  }
  
  private cleanupSignalingMessages(): void {
    if (!this.lobbyId) return;
    
    try {
      // Get all keys in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        // Check if it's a signaling message for our lobby
        if (key && key.startsWith(`signal-${this.lobbyId}-`)) {
          // Parse the message
          const messageJson = localStorage.getItem(key);
          if (messageJson) {
            const message = JSON.parse(messageJson);
            
            // Remove messages older than 30 seconds
            if (Date.now() - message.timestamp > 30000) {
              localStorage.removeItem(key);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up signaling messages:', error);
    }
  }
  
  public handleStorageEvent(event: StorageEvent): void {
    if (!event.key || !event.newValue || !this.lobbyId) return;
    
    // Check if it's a signaling message for our lobby
    if (event.key.startsWith(`signal-${this.lobbyId}-`)) {
      try {
        const message = JSON.parse(event.newValue);
        
        // Skip our own messages
        if (message.sender === this.peerId) return;
        
        // Process messages intended for everyone or specifically for us
        if (!message.recipient || message.recipient === this.peerId) {
          console.log(`Received signaling message via localStorage from ${message.sender}: ${message.type}`);
          
          if (message.type === 'presence') {
            // Connect to the peer if not already connected
            if (message.sender !== this.peerId && !this.connections.has(message.sender)) {
              this.connectToPeer(message.sender, true);
            }
          } else if (message.type === 'offer') {
            this.handleOffer(message.sender, message.sdp);
          } else if (message.type === 'answer') {
            this.handleAnswer(message.sender, message.sdp);
          } else if (message.type === 'ice-candidate') {
            this.handleIceCandidate(message.sender, message.candidate);
          }
        }
      } catch (error) {
        console.error('Error handling storage event:', error);
      }
    }
  }
  
  public refreshConnections(): void {
    console.log('Refreshing all connections');
    
    // Disconnect and reconnect to all peers
    const peers = Array.from(this.connectedPeers);
    
    // Close all connections
    peers.forEach(peerId => {
      const pc = this.connections.get(peerId);
      if (pc) {
        pc.close();
      }
      this.connections.delete(peerId);
      this.dataChannels.delete(peerId);
    });
    
    this.connectedPeers.clear();
    
    // Reconnect after a short delay
    setTimeout(() => {
      peers.forEach(peerId => {
        this.connectToPeer(peerId, true);
      });
      
      // Also broadcast presence to discover new peers
      this.broadcastPresence();
    }, 1000);
  }
}

const AudioLobby: React.FC<AudioLobbyProps> = ({ onClose, lobbyId }) => {
  const { currentUser } = useChatContext();
  const userId = currentUser?.id || '';
  const username = currentUser?.username || '';
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{[key: string]: MediaStream}>({});
  const [isMuted, setIsMuted] = useState(false);
  const [participants, setParticipants] = useState<{id: string, name: string, isMuted: boolean}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAudioActive, setIsAudioActive] = useState<{[key: string]: boolean}>({});
  const [isScanning, setIsScanning] = useState(false);
  const [manualPeerId, setManualPeerId] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  
  // Refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalysersRef = useRef<{[key: string]: AnalyserNode}>({});
  const meshNetworkRef = useRef<P2PMeshNetwork>(P2PMeshNetwork.getInstance());
  const animationFrameRef = useRef<number | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  
  // Generate a lobby ID if not provided
  const actualLobbyId = useRef(lobbyId || `lobby-${Math.random().toString(36).substring(2, 10)}`);
  
  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
      
      // Broadcast mute state change
      meshNetworkRef.current.broadcast('mute-change', {
        userId: meshNetworkRef.current.getPeerId(),
        isMuted: !isMuted
      });
    }
  };
  
  // Copy invite link to clipboard
  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy link:', err);
        setError('Failed to copy link to clipboard');
      });
  };
  
  // Handle leaving the lobby
  const handleLeaveLobby = () => {
    // Clean up WebRTC connections
    meshNetworkRef.current.disconnect();
    
    // Stop audio processing
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    // Close the lobby
    onClose();
  };
  
  // Scan for peers
  const scanForPeers = async () => {
    setIsScanning(true);
    try {
      const foundPeers = await meshNetworkRef.current.scanForPeers();
      // Check if foundPeers is defined before accessing its length
      if (foundPeers && foundPeers.length > 0) {
        console.log(`Found ${foundPeers.length} peers`);
      } else {
        console.log('No new peers found');
      }
    } catch (error) {
      console.error('Error scanning for peers:', error);
      setError('Failed to scan for peers');
    } finally {
      // Stop scanning after 3 seconds
      setTimeout(() => {
        setIsScanning(false);
      }, 3000);
    }
  };
  
  // Connect to a peer manually
  const connectToPeerManually = () => {
    if (manualPeerId && manualPeerId !== meshNetworkRef.current.getPeerId()) {
      console.log(`Manually connecting to peer: ${manualPeerId}`);
      addDebugLog(`Attempting to connect to: ${manualPeerId}`);
      meshNetworkRef.current.connectToPeer(manualPeerId, true);
      setManualPeerId('');
    }
  };
  
  // Initialize audio
  const initializeAudio = async () => {
    try {
      // Request audio with echo cancellation and noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      // Set up audio context for voice activity detection
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioAnalysersRef.current[meshNetworkRef.current.getPeerId()] = analyser;
      
      // Set the local stream in the mesh network
      meshNetworkRef.current.setLocalStream(stream);
      
      // Start audio level detection
      detectAudioLevels();
      
      return stream;
    } catch (error) {
      console.error('Error initializing audio:', error);
      setError('Could not access microphone. Please check your permissions.');
      throw error;
    }
  };
  
  // Detect audio levels for all streams
  const detectAudioLevels = () => {
    const detectLevels = () => {
      const audioLevels: {[key: string]: boolean} = {};
      
      // Check each analyser
      Object.entries(audioAnalysersRef.current).forEach(([peerId, analyser]) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average level
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        
        // Set speaking state based on threshold
        audioLevels[peerId] = average > 20;
      });
      
      setIsAudioActive(audioLevels);
      
      animationFrameRef.current = requestAnimationFrame(detectLevels);
    };
    
    animationFrameRef.current = requestAnimationFrame(detectLevels);
  };
  
  // Set up the mesh network and audio
  useEffect(() => {
    if (!lobbyId) return;
    
    console.log(`Initializing audio lobby: ${lobbyId}`);
    
    // Set the lobby ID in the mesh network
    meshNetworkRef.current.setLobbyId(lobbyId);
    
    // Set username if available
    if (username) {
      meshNetworkRef.current.setUsername(username);
    }
    
    try {
      // Generate invite link
      const link = meshNetworkRef.current.createInviteLink();
      setInviteLink(link);
    } catch (error) {
      console.error('Error generating invite link:', error);
      setError('Failed to generate invite link');
    }
    
    // Set up event listeners for peer connections
    const peerConnectedUnsubscribe = meshNetworkRef.current.on('peer-connected', (data) => {
      try {
        const { peerId } = data;
        console.log(`Peer connected: ${peerId}`);
        addDebugLog(`Peer connected: ${peerId}`);
        
        // Add the peer to participants if not already there
        setParticipants(prev => {
          if (!prev.some(p => p.id === peerId)) {
            return [...prev, { 
              id: peerId, 
              name: `User-${peerId.substring(0, 4)}`, 
              isMuted: false 
            }];
          }
          return prev;
        });
      } catch (error) {
        console.error('Error handling peer-connected event:', error);
      }
    });
    
    const peerDisconnectedUnsubscribe = meshNetworkRef.current.on('peer-disconnected', (data) => {
      try {
        const { peerId } = data;
        console.log(`Peer disconnected: ${peerId}`);
        addDebugLog(`Peer disconnected: ${peerId}`);
        
        // Remove the peer from participants
        setParticipants(prev => prev.filter(p => p.id !== peerId));
        
        // Remove the remote stream
        setRemoteStreams(prev => {
          const newStreams = { ...prev };
          delete newStreams[peerId];
          return newStreams;
        });
      } catch (error) {
        console.error('Error handling peer-disconnected event:', error);
      }
    });
    
    // Broadcast presence periodically
    const broadcastInterval = setInterval(() => {
      meshNetworkRef.current.broadcastPresence();
    }, 10000); // Re-broadcast every 10 seconds
    
    return () => {
      // Clean up
      peerConnectedUnsubscribe();
      peerDisconnectedUnsubscribe();
      clearInterval(broadcastInterval);
      
      // Remove storage event listener
      window.removeEventListener('storage', meshNetworkRef.current.handleStorageEvent);
    };
  }, [lobbyId, username]);
  
  // Update the useEffect for handling tracks
  useEffect(() => {
    // Set up track event listener
    const trackUnsubscribe = meshNetworkRef.current.on('track', (data) => {
      try {
        const { peerId, track, streams } = data;
        
        if (streams && streams.length > 0) {
          console.log(`Received ${track.kind} track from ${peerId}`);
          addDebugLog(`Received audio from: ${peerId}`);
          
          // Store the remote stream
          setRemoteStreams(prev => ({
            ...prev,
            [peerId]: streams[0]
          }));
          
          // Make sure the peer is in the participants list
          setParticipants(prev => {
            if (!prev.some(p => p.id === peerId)) {
              return [...prev, { 
                id: peerId, 
                name: `User-${peerId.substring(0, 4)}`, 
                isMuted: false 
              }];
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('Error handling track event:', error);
      }
    });
    
    return () => {
      trackUnsubscribe();
    };
  }, []);
  
  // Add debug log function
  const addDebugLog = (message: string) => {
    if (debugMode) {
      console.log(`[DEBUG] ${message}`);
      setDebugLogs(prev => [...prev.slice(-19), message]);
    }
  };
  
  return (
    <div className="audio-lobby">
      <div className="audio-lobby-header">
        <h2>Voice Chat</h2>
        <div className="audio-lobby-controls">
          <button 
            className={`mic-button ${isMuted ? 'muted' : ''}`} 
            onClick={toggleMute}
          >
            {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
          </button>
          <button 
            className="debug-button" 
            onClick={() => setDebugMode(!debugMode)}
            title="Toggle debug mode"
          >
            <FaBug />
          </button>
          <button className="leave-button" onClick={handleLeaveLobby}>
            <FaSignOutAlt />
          </button>
        </div>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <div className="invite-section">
        <h3><FaLink /> Invite Others</h3>
        <div className="invite-link-container">
          <input 
            type="text" 
            value={inviteLink} 
            readOnly 
            className="invite-link-input"
          />
          <button 
            className="copy-link-button" 
            onClick={copyInviteLink}
            title="Copy invite link"
          >
            <FaCopy />
            {linkCopied && <span className="copied-tooltip">Copied!</span>}
          </button>
        </div>
        <p className="invite-instructions">
          Share this link with others to join your voice chat. They'll connect directly to you.
        </p>
      </div>
      
      <div className="scan-section">
        <h3><FaSearch /> Find Others</h3>
        <div className="scan-controls">
          <button 
            className={`scan-button ${isScanning ? 'scanning' : ''}`} 
            onClick={scanForPeers}
            disabled={isScanning}
          >
            {isScanning ? 'Scanning...' : 'Scan for Peers'}
          </button>
        </div>
        
        <div className="manual-connect">
          <input 
            type="text" 
            value={manualPeerId} 
            onChange={(e) => setManualPeerId(e.target.value)}
            placeholder="Enter peer ID to connect"
            className="peer-id-input"
          />
          <button 
            className="connect-button" 
            onClick={connectToPeerManually}
            disabled={!manualPeerId}
          >
            Connect
          </button>
        </div>
        
        <p className="peer-id-display">
          Your Peer ID: <span className="peer-id">{meshNetworkRef.current.getPeerId()}</span>
        </p>
      </div>
      
      <div className="participants-container">
        <h3><FaUsers /> Participants ({participants.length})</h3>
        <div className="participants-list">
          {participants.map((participant) => (
            <motion.div 
              key={participant.id}
              className={`participant ${isAudioActive[participant.id] ? 'speaking' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="participant-avatar">
                {participant.name.charAt(0).toUpperCase()}
              </div>
              <div className="participant-info">
                <span className="participant-name">
                  {participant.name} {participant.id === meshNetworkRef.current.getPeerId() && '(You)'}
                </span>
                <span className="participant-status">
                  {participant.isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                </span>
              </div>
              {participant.id !== meshNetworkRef.current.getPeerId() && remoteStreams[participant.id] && (
                <audio 
                  ref={el => {
                    if (el) {
                      el.srcObject = remoteStreams[participant.id];
                      el.autoplay = true;
                      el.setAttribute('playsInline', 'true');
                      el.play().catch(e => {
                        console.error("Error playing audio:", e);
                        addDebugLog(`Audio play error: ${e.message}`);
                      });
                    }
                  }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
      
      {debugMode && (
        <div className="debug-panel">
          <h3>Debug Information</h3>
          <div className="debug-logs">
            {debugLogs.map((log, index) => (
              <div key={index} className="debug-log">{log}</div>
            ))}
          </div>
          <div className="debug-actions">
            <button onClick={() => meshNetworkRef.current.broadcastPresence()}>
              Broadcast Presence
            </button>
            <button onClick={() => {
              const myPeerId = meshNetworkRef.current.getPeerId();
              addDebugLog(`My Peer ID: ${myPeerId}`);
            }}>
              Show My ID
            </button>
            <button onClick={() => {
              const peers = meshNetworkRef.current.getConnectedPeers();
              addDebugLog(`Connected Peers: ${peers.length ? peers.join(', ') : 'None'}`);
            }}>
              Show Peers
            </button>
            <button onClick={() => {
              meshNetworkRef.current.refreshConnections();
              addDebugLog('Refreshing all connections');
            }}>
              Refresh Connections
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioLobby; 