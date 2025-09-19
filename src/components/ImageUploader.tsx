import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { sanitize } from '../lib/filename';

type FileStatus = {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
};

const BUCKET_NAME = 'filacollectibles';
const MAX_FILES = 20;

export const ImageUploader = ({ onComplete }: { onComplete: () => void }) => {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (files.length + acceptedFiles.length > MAX_FILES) {
      alert(`You can only upload a maximum of ${MAX_FILES} files at a time.`);
      return;
    }
    const newFiles: FileStatus[] = acceptedFiles.map(file => ({
      file,
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
  });

  const handleUpload = async () => {
    setIsUploading(true);

    const uploadPromises = files.filter(f => f.status === 'pending').map(async (fileStatus, index) => {
      const updateFileStatus = (status: Partial<FileStatus>) => {
        setFiles(prev => {
          const newFiles = [...prev];
          newFiles[index] = { ...newFiles[index], ...status };
          return newFiles;
        });
      };

      try {
        updateFileStatus({ status: 'uploading', progress: 0 });
        const cleanName = sanitize(fileStatus.file.name);
        
        const { error } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(cleanName, fileStatus.file, {
            cacheControl: '3600',
            upsert: false, // Μην αντικαθιστάς υπάρχοντα αρχεία
          });

        if (error) {
          throw new Error(error.message);
        }
        
        updateFileStatus({ status: 'success', progress: 100 });
      } catch (e: any) {
        updateFileStatus({ status: 'error', error: e.message });
      }
    });

    await Promise.all(uploadPromises);
    setIsUploading(false);
  };

  const allDone = files.length > 0 && files.every(f => f.status === 'success' || f.status === 'error');

  return (
    <div className="space-y-4">
      <div 
        {...getRootProps()} 
        className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer
                    ${isDragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the files here ...</p>
        ) : (
          <p>Drag 'n' drop some files here, or click to select files (max {MAX_FILES})</p>
        )}
      </div>

      {files.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-gray-100 dark:bg-gray-800">
              <div className="flex-shrink-0 w-10 h-10">
                <img src={URL.createObjectURL(f.file)} alt={f.file.name} className="w-full h-full object-cover rounded" />
              </div>
              <div className="flex-grow">
                <div className="text-sm font-medium truncate">{f.file.name}</div>
                <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      f.status === 'success' ? 'bg-green-500' : 
                      f.status === 'error' ? 'bg-red-500' : 'bg-indigo-500'
                    }`} 
                    style={{ width: `${f.progress}%` }}
                  ></div>
                </div>
                {f.status === 'error' && <div className="text-xs text-red-500 mt-1">{f.error}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        {allDone ? (
          <button className="btn btn-primary" onClick={onComplete}>Close</button>
        ) : (
          <>
            <button className="btn" onClick={() => setFiles([])} disabled={isUploading}>Clear</button>
            <button 
              className="btn btn-primary" 
              onClick={handleUpload} 
              disabled={isUploading || files.length === 0 || files.every(f => f.status !== 'pending')}
            >
              {isUploading ? 'Uploading...' : `Upload ${files.filter(f => f.status === 'pending').length} Files`}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
