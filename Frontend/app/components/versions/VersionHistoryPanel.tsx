"use client";

import React, { useState, useEffect } from 'react';
import { FileSystemItem } from '@/types/fileSystem';

interface FileVersion {
  versionId: string;
  isLatest: boolean;
  lastModified: string;
  size: number;
  etag: string;
  isDeleteMarker: boolean;
}

interface VersionHistoryPanelProps {
  projectId: string;
  file: FileSystemItem;
  baseUrl: string;
  onRestore?: (versionId: string) => void;
  onClose?: () => void;
}

export default function VersionHistoryPanel({
  projectId,
  file,
  baseUrl,
  onRestore,
  onClose
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [versionContent, setVersionContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  // Load versions when component mounts
  useEffect(() => {
    loadVersions();
  }, [projectId, file.path]);

  const loadVersions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${baseUrl}/api/projects/${projectId}/files/versions?path=${encodeURIComponent(file.path)}`
      );
      const data = await response.json();

      if (data.success) {
        setVersions(data.versions || []);
      } else {
        setError(data.error || 'Failed to load versions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const loadVersionContent = async (versionId: string) => {
    setLoadingContent(true);
    try {
      const response = await fetch(
        `${baseUrl}/api/projects/${projectId}/files/version/${encodeURIComponent(versionId)}?path=${encodeURIComponent(file.path)}`
      );
      const data = await response.json();

      if (data.success) {
        setVersionContent(data.content);
        setSelectedVersion(versionId);
      } else {
        setError(data.error || 'Failed to load version content');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!confirm('Are you sure you want to restore this version? This will create a new version with the old content.')) {
      return;
    }

    try {
      const response = await fetch(
        `${baseUrl}/api/projects/${projectId}/files/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: file.path,
            versionId: versionId
          })
        }
      );

      const data = await response.json();

      if (data.success) {
        alert('File restored successfully!');
        if (onRestore) {
          onRestore(versionId);
        }
        // Reload versions to show the new version
        loadVersions();
      } else {
        alert(`Failed to restore: ${data.error}`);
      }
    } catch (err) {
      alert(`Error restoring version: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="version-history-panel" style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: '400px',
      backgroundColor: '#1e1e1e',
      borderLeft: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>
          Version History
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: '20px'
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* File info */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #333',
        fontSize: '12px',
        color: '#888'
      }}>
        <div>{file.name}</div>
        <div style={{ marginTop: '4px' }}>{file.path}</div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '16px', textAlign: 'center', color: '#888' }}>
          Loading versions...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ padding: '16px', color: '#ff6b6b' }}>
          Error: {error}
        </div>
      )}

      {/* Versions list */}
      {!loading && !error && versions.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', color: '#888' }}>
          No versions found. Versioning may not be enabled.
        </div>
      )}

      {!loading && versions.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {versions.map((version, index) => (
            <div
              key={version.versionId}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #2a2a2a',
                cursor: 'pointer',
                backgroundColor: selectedVersion === version.versionId ? '#2a2a2a' : 'transparent',
                '&:hover': { backgroundColor: '#252525' }
              }}
              onClick={() => loadVersionContent(version.versionId)}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px'
              }}>
                <span style={{ color: '#fff', fontSize: '14px' }}>
                  Version {versions.length - index}
                  {version.isLatest && <span style={{ color: '#4caf50', marginLeft: '8px', fontSize: '12px' }}>(Current)</span>}
                </span>
                {!version.isLatest && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(version.versionId);
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      backgroundColor: '#007acc',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    Restore
                  </button>
                )}
              </div>

              <div style={{ fontSize: '11px', color: '#888' }}>
                {formatDate(version.lastModified)}
              </div>

              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                {formatSize(version.size)}
                {version.isDeleteMarker && <span style={{ color: '#ff6b6b', marginLeft: '8px' }}>(Deleted)</span>}
              </div>

              <div style={{ fontSize: '10px', color: '#555', marginTop: '4px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {version.versionId.substring(0, 20)}...
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Version content preview */}
      {selectedVersion && (
        <div style={{
          borderTop: '1px solid #333',
          maxHeight: '300px',
          overflowY: 'auto',
          backgroundColor: '#1a1a1a'
        }}>
          <div style={{
            padding: '8px 16px',
            backgroundColor: '#252525',
            fontSize: '12px',
            color: '#888',
            borderBottom: '1px solid #333'
          }}>
            Preview
          </div>
          {loadingContent ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#888' }}>
              Loading content...
            </div>
          ) : (
            <pre style={{
              padding: '16px',
              margin: 0,
              fontSize: '12px',
              color: '#d4d4d4',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {versionContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
