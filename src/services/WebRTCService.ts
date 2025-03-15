import { db } from '../firebase';
import { 
  collection, doc, setDoc, onSnapshot, deleteDoc, 
  query, where, getDoc 
} from 'firebase/firestore';

// WebRTC configuration
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callId: string | null = null;
  private userId: string;
  private remoteUserId: string | null = null;
  private onCallStatusChange: (status: 'connected' | 'disconnected') => void;
  private unsubscribeCallDoc: (() => void) | null = null;

  constructor(
    userId: string, 
    onCallStatusChange: (status: 'connected' | 'disconnected') => void
  ) {
    this.userId = userId;
    this.onCallStatusChange = onCallStatusChange;
  }

  // Initialize local media stream
  async initLocalStream(): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }

  // Make a call to another user
  async callUser(remoteUserId: string): Promise<void> {
    this.remoteUserId = remoteUserId;
    this.callId = `${this.userId}_${remoteUserId}`;
    
    // Create peer connection
    this.peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream tracks to peer connection
    if (!this.localStream) {
      await this.initLocalStream();
    }
    
    this.localStream!.getTracks().forEach(track => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });
    
    // Set up remote stream
    this.remoteStream = new MediaStream();
    
    // Listen for remote tracks
    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        this.remoteStream!.addTrack(track);
      });
      this.onCallStatusChange('connected');
    };
    
    // Listen for ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.addIceCandidate('caller', event.candidate);
      }
    };
    
    // Create offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    // Create call document in Firestore
    const callDoc = doc(db, 'calls', this.callId);
    await setDoc(callDoc, {
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
      caller: this.userId,
      callee: remoteUserId,
      status: 'pending',
      createdAt: new Date(),
    });
    
    // Listen for answer
    this.unsubscribeCallDoc = onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!this.peerConnection || !data) return;
      
      // If we got an answer, set it as remote description
      if (data.answer && !this.peerConnection.currentRemoteDescription) {
        const answerDescription = new RTCSessionDescription(data.answer);
        this.peerConnection.setRemoteDescription(answerDescription);
      }
      
      // If call was rejected or ended
      if (data.status === 'rejected' || data.status === 'ended') {
        this.endCall();
      }
    });
    
    // Listen for callee ICE candidates
    const calleeCandidatesCollection = collection(callDoc, 'calleeCandidates');
    onSnapshot(calleeCandidatesCollection, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && this.peerConnection) {
          const candidate = new RTCIceCandidate(change.doc.data());
          this.peerConnection.addIceCandidate(candidate);
        }
      });
    });
  }
  
  // Answer an incoming call
  async answerCall(callId: string, callerId: string): Promise<void> {
    this.callId = callId;
    this.remoteUserId = callerId;
    
    // Create peer connection
    this.peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream tracks to peer connection
    if (!this.localStream) {
      await this.initLocalStream();
    }
    
    this.localStream!.getTracks().forEach(track => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });
    
    // Set up remote stream
    this.remoteStream = new MediaStream();
    
    // Listen for remote tracks
    this.peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        this.remoteStream!.addTrack(track);
      });
      this.onCallStatusChange('connected');
    };
    
    // Listen for ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.addIceCandidate('callee', event.candidate);
      }
    };
    
    // Get call document
    const callDoc = doc(db, 'calls', callId);
    const callSnapshot = await getDoc(callDoc);
    const callData = callSnapshot.data();
    
    if (!callData) {
      throw new Error('Call not found');
    }
    
    // Set remote description (offer)
    const offerDescription = new RTCSessionDescription(callData.offer);
    await this.peerConnection.setRemoteDescription(offerDescription);
    
    // Create answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    // Update call document with answer
    await setDoc(callDoc, {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
      status: 'accepted',
    }, { merge: true });
    
    // Listen for caller ICE candidates
    const callerCandidatesCollection = collection(callDoc, 'callerCandidates');
    onSnapshot(callerCandidatesCollection, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && this.peerConnection) {
          const candidate = new RTCIceCandidate(change.doc.data());
          this.peerConnection.addIceCandidate(candidate);
        }
      });
    });
    
    // Listen for call status changes
    this.unsubscribeCallDoc = onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      
      // If call was ended
      if (data.status === 'ended') {
        this.endCall();
      }
    });
  }
  
  // Add ICE candidate to Firestore
  private async addIceCandidate(role: 'caller' | 'callee', candidate: RTCIceCandidate): Promise<void> {
    if (!this.callId) return;
    
    const callDoc = doc(db, 'calls', this.callId);
    const candidatesCollection = collection(callDoc, `${role}Candidates`);
    await setDoc(doc(candidatesCollection), candidate.toJSON());
  }
  
  // End the current call
  async endCall(): Promise<void> {
    // Update call status in Firestore
    if (this.callId) {
      const callDoc = doc(db, 'calls', this.callId);
      await setDoc(callDoc, { status: 'ended' }, { merge: true });
      
      // Clean up after a delay to ensure the other peer gets the update
      setTimeout(async () => {
        await deleteDoc(callDoc);
      }, 5000);
    }
    
    // Stop all tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    
    // Clean up listeners
    if (this.unsubscribeCallDoc) {
      this.unsubscribeCallDoc();
    }
    
    // Reset state
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.callId = null;
    this.remoteUserId = null;
    
    // Notify about call end
    this.onCallStatusChange('disconnected');
  }
  
  // Reject an incoming call
  async rejectCall(callId: string): Promise<void> {
    const callDoc = doc(db, 'calls', callId);
    await setDoc(callDoc, { status: 'rejected' }, { merge: true });
  }
  
  // Get the remote stream
  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }
  
  // Check for incoming calls
  listenForIncomingCalls(onIncomingCall: (callId: string, callerId: string, callerName: string) => void): () => void {
    // Query for calls where this user is the callee and status is pending
    const callsQuery = query(
      collection(db, 'calls'),
      where('callee', '==', this.userId),
      where('status', '==', 'pending')
    );
    
    return onSnapshot(callsQuery, async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const callData = change.doc.data();
          const callId = change.doc.id;
          const callerId = callData.caller;
          
          // Get caller name
          const callerDoc = await getDoc(doc(db, 'users', callerId));
          const callerName = callerDoc.data()?.username || 'Unknown';
          
          onIncomingCall(callId, callerId, callerName);
        }
      });
    });
  }
}

export default WebRTCService; 