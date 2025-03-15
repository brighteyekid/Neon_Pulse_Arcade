import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { FaImage, FaVideo, FaFileAudio, FaSmile, FaTimes, FaUpload, FaReply } from 'react-icons/fa';
import { useChatContext } from '../context/ChatContext';
import './MediaShare.css';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';

interface MediaShareProps {
  onClose: () => void;
  replyTo?: {
    id: string;
    username: string;
    text: string;
  } | null;
  onReplyCancel?: () => void;
}

const MediaShare: React.FC<MediaShareProps> = ({ onClose, replyTo = null, onReplyCancel }) => {
  const { sendMediaMessage } = useChatContext();
  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'audio' | 'gif'>('image');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [gifSearchTerm, setGifSearchTerm] = useState('');
  const [gifResults, setGifResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleTabChange = (tab: 'image' | 'video' | 'audio' | 'gif') => {
    setActiveTab(tab);
    setPreviewUrl(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit');
      return;
    }

    // Create preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const uploadFile = async () => {
    if (!fileInputRef.current?.files?.[0]) return;
    
    const file = fileInputRef.current.files[0];
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Create a reader to get the file as base64
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          // Simulate upload progress
          const progressInterval = setInterval(() => {
            setUploadProgress(prev => {
              if (prev >= 90) {
                clearInterval(progressInterval);
                return 90;
              }
              return prev + 10;
            });
          }, 300);
          
          // Get the base64 data
          const base64Data = e.target?.result as string;
          
          // For simplicity and to avoid CORS issues, we'll store the base64 data directly in Firestore
          // Note: This is not ideal for large files but works for small images/files
          // In a production app, you'd want to use a proper storage solution
          
          // Generate a unique filename
          const fileId = uuidv4();
          const fileExtension = file.name.split('.').pop() || '';
          const fileName = `${fileId}.${fileExtension}`;
          
          // Send media message with reply information
          await sendMediaMessage(activeTab, base64Data, file.name, replyTo || undefined);
          
          // Clear interval and set progress to 100%
          clearInterval(progressInterval);
          setUploadProgress(100);
          
          // Close media share after successful upload
          setTimeout(() => {
            onClose();
          }, 1000);
        } catch (error) {
          console.error('Error processing file:', error);
          alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setIsUploading(false);
        }
      };
      
      reader.onerror = () => {
        console.error('Error reading file');
        alert('Failed to read file');
        setIsUploading(false);
      };
      
      // Read the file as data URL (base64)
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsUploading(false);
    }
  };

  const searchGifs = async () => {
    if (!gifSearchTerm.trim()) return;
    
    setIsSearching(true);
    setGifResults([]);
    
    try {
      // Use a CORS proxy to avoid CORS issues
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=pLURtkhVrUXr3KG25Gy5IvzziV5OrZGa&q=${encodeURIComponent(gifSearchTerm)}&limit=12&rating=g`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Extract GIF URLs from response
      const urls = data.data.map((gif: any) => gif.images.fixed_height.url);
      
      setGifResults(urls);
    } catch (error) {
      console.error('Error searching for GIFs:', error);
      
      // Fallback to some predefined GIFs
      setGifResults([
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDdtY2JxYnV1a3I2bWt4ZWF1bWF4Ym43aXhxcnl6YnQyaWFpajhmbiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7abKhOpu0NwenH3O/giphy.gif',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDdtY2JxYnV1a3I2bWt4ZWF1bWF4Ym43aXhxcnl6YnQyaWFpajhmbiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7abKhOpu0NwenH3O/giphy.gif',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDdtY2JxYnV1a3I2bWt4ZWF1bWF4Ym43aXhxcnl6YnQyaWFpajhmbiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7abKhOpu0NwenH3O/giphy.gif',
      ]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectGif = async (url: string) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Extract filename from URL
      const urlParts = url.split('/');
      const fileName = urlParts[urlParts.length - 1] || 'animated.gif';
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);
      
      // Send media message with reply information
      await sendMediaMessage('gif', url, `${gifSearchTerm}.gif`, replyTo || undefined);
      
      // Clear interval and set progress to 100%
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      // Close media share after successful upload
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Error sharing GIF:', error);
      alert(`Failed to share GIF: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsUploading(false);
    }
  };

  return (
    <div className="media-share-container">
      <div className="media-share-header">
        <h2>Share Media</h2>
        <button className="close-button" onClick={onClose}>
          <FaTimes />
        </button>
      </div>
      
      {/* Reply preview */}
      {replyTo && (
        <div className="media-share-reply-preview">
          <div className="reply-preview-content">
            <FaReply className="reply-preview-icon" />
            <div className="reply-preview-text">
              <span className="reply-preview-username">@{replyTo.username}</span>
              <span className="reply-preview-message">{replyTo.text.length > 30 ? replyTo.text.substring(0, 30) + '...' : replyTo.text}</span>
            </div>
          </div>
          <button 
            type="button" 
            className="reply-preview-cancel"
            onClick={onReplyCancel}
          >
            <FaTimes />
          </button>
        </div>
      )}
      
      <div className="media-share-tabs">
        <button 
          className={`tab-button ${activeTab === 'image' ? 'active' : ''}`}
          onClick={() => handleTabChange('image')}
        >
          <FaImage /> Image
        </button>
        <button 
          className={`tab-button ${activeTab === 'video' ? 'active' : ''}`}
          onClick={() => handleTabChange('video')}
        >
          <FaVideo /> Video
        </button>
        <button 
          className={`tab-button ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => handleTabChange('audio')}
        >
          <FaFileAudio /> Audio
        </button>
        <button 
          className={`tab-button ${activeTab === 'gif' ? 'active' : ''}`}
          onClick={() => handleTabChange('gif')}
        >
          <FaSmile /> GIF
        </button>
      </div>
      
      <div className="media-share-content">
        {activeTab === 'gif' ? (
          <div className="gif-search-container">
            <div className="gif-search-input">
              <input
                type="text"
                value={gifSearchTerm}
                onChange={(e) => setGifSearchTerm(e.target.value)}
                placeholder="Search for GIFs..."
                className="retro-input"
                onKeyPress={(e) => e.key === 'Enter' && searchGifs()}
              />
              <button 
                className="search-button retro-button-small"
                onClick={searchGifs}
                disabled={isSearching}
              >
                Search
              </button>
            </div>
            
            {isSearching ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Searching...</p>
              </div>
            ) : (
              <div className="gif-results">
                {gifResults.length > 0 ? (
                  gifResults.map((url, index) => (
                    <div 
                      key={index} 
                      className="gif-item"
                      onClick={() => selectGif(url)}
                    >
                      <img src={url} alt={`GIF result ${index}`} />
                    </div>
                  ))
                ) : (
                  <p className="no-results">
                    {gifSearchTerm ? 'No GIFs found. Try another search term.' : 'Search for GIFs to display results.'}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="file-upload-container">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept={
                  activeTab === 'image' ? 'image/*' :
                  activeTab === 'video' ? 'video/*' :
                  'audio/*'
                }
                className="file-input"
                id="media-file-input"
              />
              <label htmlFor="media-file-input" className="file-input-label retro-button">
                <FaUpload /> Select {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </label>
              <p className="file-info">Max file size: 5MB</p>
            </div>
            
            {previewUrl && (
              <div className="preview-container">
                {activeTab === 'image' && (
                  <img src={previewUrl} alt="Preview" className="media-preview" />
                )}
                {activeTab === 'video' && (
                  <video src={previewUrl} controls className="media-preview" />
                )}
                {activeTab === 'audio' && (
                  <audio src={previewUrl} controls className="media-preview" />
                )}
              </div>
            )}
          </>
        )}
      </div>
      
      {isUploading && (
        <div className="upload-progress-container">
          <div className="upload-progress-bar">
            <div 
              className="upload-progress-fill"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p>{uploadProgress}% Uploaded</p>
        </div>
      )}
      
      {activeTab !== 'gif' && (
        <div className="media-share-actions">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="retro-button-send"
            onClick={uploadFile}
            disabled={!previewUrl || isUploading}
          >
            Share {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          </motion.button>
        </div>
      )}
    </div>
  );
};

export default MediaShare; 