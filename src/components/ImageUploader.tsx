import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { DragDropContext, Droppable, Draggable, OnDragEndResponder } from '@hello-pangea/dnd';

// Μοναδικό ID για κάθε αρχείο, απαραίτητο για το dnd
type FileStatus = {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
};

// Νέα δομή για τα groups
type ImageGroup = {
  id: string; // ID του group
  name: string; // όνομα του group (π.χ. "gittens")
  files: FileStatus[];
};

const BUCKET_NAME = 'filacollectibles';
const MAX_FILES = 20;

// Helper function για να βρίσκει το βασικό όνομα από το αρχείο
const getBaseName = (fileName: string) => {
  return fileName
    .toLowerCase()
    .replace(/front|back|[\s_-]+1|[\s_-]+2|[\s_-]+3/gi, '') // αφαιρεί front/back/νούμερα
    .replace(/\.[^/.]+$/, "") // αφαιρεί την κατάληξη
    .replace(/[^a-z0-9-]/g, '-') // καθαρίζει ειδικούς χαρακτήρες
    .trim() || 'card'; // fallback name
};

export const ImageUploader = ({ onComplete }: { onComplete: () => void }) => {
  const [groups, setGroups] = useState<ImageGroup[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setGroups(prevGroups => {
      const newGroups = [...prevGroups];

      acceptedFiles.forEach(file => {
        const baseName = getBaseName(file.name);
        const fileStatus: FileStatus = { id: uuidv4(), file, status: 'pending', progress: 0 };
        
        const existingGroup = newGroups.find(g => g.name === baseName);
        if (existingGroup) {
          existingGroup.files.push(fileStatus);
        } else {
          newGroups.push({ id: uuidv4(), name: baseName, files: [fileStatus] });
        }
      });

      return newGroups;
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
  });

  const onDragEnd: OnDragEndResponder = (result) => {
    const { source, destination } = result;
    if (!destination) return;

    const sourceGroupId = source.droppableId;
    const destGroupId = destination.droppableId;

    setGroups(prev => {
      const newGroups = [...prev]; // Create a mutable copy

      const sourceGroupIndex = newGroups.findIndex(g => g.id === sourceGroupId);
      const destGroupIndex = newGroups.findIndex(g => g.id === destGroupId);

      if (sourceGroupIndex === -1 || destGroupIndex === -1) return prev;

      const sourceGroup = newGroups[sourceGroupIndex];
      const [movedFile] = sourceGroup.files.splice(source.index, 1);

      if (sourceGroupId === destGroupId) {
        // Re-ordering within the same group
        sourceGroup.files.splice(destination.index, 0, movedFile);
      } else {
        // Moving to a different group
        const destGroup = newGroups[destGroupIndex];
        destGroup.files.splice(destination.index, 0, movedFile);
      }

      // Filter out groups that might have become empty
      return newGroups.filter(g => g.files.length > 0);
    });
  };

  const handleUpload = async () => {
    setIsUploading(true);

    const uploadPromises = groups.flatMap(group => {
      // Κάθε group παίρνει ένα ΜΟΝΑΔΙΚΟ ID για το path στο storage
      const groupUploadId = uuidv4(); 
      
      return group.files.map(async (fileStatus, index) => {
        
        const updateFileStatus = (status: Partial<FileStatus>) => {
          setGroups(prev => prev.map(g => {
            if (g.id !== group.id) return g;
            return {
              ...g,
              files: g.files.map(f => f.id === fileStatus.id ? { ...f, ...status } : f),
            };
          }));
        };

        try {
          updateFileStatus({ status: 'uploading', progress: 5 });

          const file = fileStatus.file;
          const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          
          let role = `${index + 1}`; // default lot numbering
          if (/front/i.test(file.name)) role = 'front';
          if (/back/i.test(file.name)) role = 'back';
          
          const newPath = `public/${groupUploadId}/${role}.${extension}`;

          const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(newPath, file, {
              cacheControl: '3600',
              upsert: true,
            });

          if (error) throw new Error(error.message);
          
          updateFileStatus({ status: 'success', progress: 100 });
        } catch (e: any) {
          updateFileStatus({ status: 'error', error: e.message, progress: 100 });
        }
      });
    });

    await Promise.all(uploadPromises);
    setIsUploading(false);
  };
  
  const allFiles = groups.flatMap(g => g.files);
  const allDone = allFiles.length > 0 && allFiles.every(f => f.status === 'success' || f.status === 'error');

  return (
    <div className="space-y-4">
      {!allDone && (
         <div 
         {...getRootProps()} 
         className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer
                     ${isDragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}
       >
         <input {...getInputProps()} />
         <p>Drag 'n' drop files here, or click to select (max {MAX_FILES})</p>
         <p className="text-xs text-gray-500 mt-1">Files with similar names (e.g., card_front, card_back) will be grouped.</p>
       </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
          {groups.map(group => (
            <Droppable key={group.id} droppableId={group.id}>
              {(provided, snapshot) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                  className={`p-3 rounded-lg border ${snapshot.isDraggingOver ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'}`}
                >
                  <div className="font-bold mb-2 capitalize text-indigo-800 dark:text-indigo-300">Group: {group.name}</div>
                  <div className="space-y-2">
                    {group.files.map((f, i) => (
                      <Draggable key={f.id} draggableId={f.id} index={i}>
                        {(provided, snapshot) => (
                           <div
                           ref={provided.innerRef}
                           {...provided.draggableProps}
                           {...provided.dragHandleProps}
                           className={`flex items-center gap-3 p-2 rounded-md ${snapshot.isDragging ? 'bg-white dark:bg-gray-700 shadow-lg' : 'bg-white/50 dark:bg-gray-900/50'}`}
                         >
                            <div className="flex-shrink-0 w-12 h-12">
                              <img src={URL.createObjectURL(f.file)} alt={f.file.name} className="w-full h-full object-cover rounded" />
                            </div>
                            <div className="flex-grow">
                              <div className="text-sm font-medium truncate">{f.file.name}</div>
                              <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all duration-300 ${
                                    f.status === 'success' ? 'bg-green-500' : 
                                    f.status === 'error' ? 'bg-red-500' : 'bg-indigo-500'
                                  }`} 
                                  style={{ width: `${f.progress}%` }}
                                ></div>
                              </div>
                              {f.status === 'error' && <div className="text-xs text-red-500 mt-1">{f.error}</div>}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <div className="flex gap-2 justify-end">
        {allDone ? (
          <button className="btn btn-primary" onClick={onComplete}>Close</button>
        ) : (
          <>
            <button className="btn" onClick={() => setGroups([])} disabled={isUploading}>Clear All</button>
            <button 
              className="btn btn-primary" 
              onClick={handleUpload} 
              disabled={isUploading || allFiles.length === 0 || allFiles.every(f => f.status !== 'pending')}
            >
              {isUploading ? 'Uploading...' : `Upload ${allFiles.filter(f => f.status === 'pending').length} Files`}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
