/*
 * File: VolumeFileBrowser.tsx
 * Project: docker-native-manager
 * Author: Pedro Farias
 * Created: 2026-04-15
 * 
 * Last Modified: Wed Apr 15 2026
 * Modified By: Pedro Farias
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Folder, File, ArrowLeft, Trash2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { showSuccess, showError } from "@/utils/toast";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

interface VolumeFileBrowserProps {
  volumeName: string;
  onClose: () => void;
}

export const VolumeFileBrowser = ({ volumeName, onClose }: VolumeFileBrowserProps) => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("/");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async (path: string) => {
    setIsLoading(true);
    try {
      const data: FileEntry[] = await invoke("list_volume_files", { 
        volumeName, 
        subPath: path 
      });
      setFiles(data);
      setCurrentPath(path);
    } catch (err) {
      showError(`Error listing files: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [volumeName]);

  useEffect(() => {
    fetchFiles("/");
  }, [fetchFiles]);

  const handleNavigate = (path: string) => {
    fetchFiles(path);
  };

  const handleGoBack = () => {
    const parentPath = currentPath.split('/').filter(Boolean).slice(0, -1).join('/') || "/";
    fetchFiles(parentPath === "" ? "/" : `/${parentPath}`);
  };

  const handleDelete = async (path: string) => {
    try {
      await invoke("delete_volume_file", { volumeName, filePath: path });
      showSuccess("File deleted");
      setFileToDelete(null);
      fetchFiles(currentPath);
    } catch (err) {
      showError(`Error deleting: ${err}`);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      const targetPath = `${currentPath}/${file.name}`;
      
      await invoke("upload_volume_file", { volumeName, targetPath, fileContent: bytes });
      showSuccess("File uploaded");
      fetchFiles(currentPath);
    } catch (err) {
      showError(`Error uploading: ${err}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {currentPath !== "/" && (
            <Button variant="ghost" size="sm" onClick={handleGoBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <span className="font-mono text-sm bg-muted px-2 py-1 rounded truncate">
            {currentPath}
          </span>
        </div>
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
          Upload File
        </Button>
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
      </div>

      <div className="flex-1 overflow-y-auto border rounded-md">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <ul className="divide-y">
            {files.map((file) => (
              <li key={file.path} className="flex items-center justify-between p-2 hover:bg-muted/50">
                <button 
                  className="flex items-center gap-2 flex-1 text-sm text-left"
                  onClick={() => file.is_dir && handleNavigate(file.path)}
                >
                  {file.is_dir ? <Folder className="w-4 h-4 text-blue-500" /> : <File className="w-4 h-4 text-gray-500" />}
                  {file.name}
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the {file.is_dir ? 'directory' : 'file'} "{file.name}".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => handleDelete(file.path)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
