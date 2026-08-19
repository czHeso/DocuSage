import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { acceptAttribute, isSupportedDocument, listAcceptedExtensions } from "@shared/documentFormats";
import { formatDate } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, FileIcon, Trash2Icon, AlertCircle, Settings } from "lucide-react";
import { Pdf } from "@shared/schema";

interface PdfUploaderProps {
  projectId: number;
}

export default function PdfUploader({ projectId }: PdfUploaderProps) {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [pdfToDelete, setPdfToDelete] = useState<number | null>(null);
  const [isProcessingEmbeddings, setIsProcessingEmbeddings] = useState<boolean>(false);
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [documentWeight, setDocumentWeight] = useState([5]); // Default weight 5
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Validace Project ID
  if (!projectId || isNaN(projectId)) {
    console.error("PDF Uploader: Invalid project ID:", projectId);
    return null;
  }

  // Fetch existing PDFs
  const { data: pdfs, isLoading } = useQuery<Pdf[]>({
    queryKey: [`/api/projects/${projectId}/pdfs`],
    enabled: !!projectId,
  });



  // Upload PDF mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ files, weight }: { files: File[], weight: number }) => {
      // Create an array of promises, one per file
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append("pdf", file);
        formData.append("weight", weight.toString());

        const response = await fetch(`/api/projects/${projectId}/pdfs`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || response.statusText);
        }

        return response.json();
      });

      // Process all promises at once
      return Promise.all(uploadPromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/pdfs`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/stats`],
      });
      toast({
        title: "PDF uploaded",
        description: "The PDF file has been uploaded and processed.",
      });
      setUploadProgress(null);
    },
    onError: (error) => {
      toast({
        title: "Error uploading the PDF",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setUploadProgress(null);
    },
  });

  // Delete PDF mutation
  const deleteMutation = useMutation({
    mutationFn: async (pdfId: number) => {
      await apiRequest("DELETE", `/api/projects/${projectId}/pdfs/${pdfId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/pdfs`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/stats`],
      });
      toast({
        title: "PDF deleted",
        description: "The PDF file has been deleted.",
      });
      setPdfToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Error deleting the PDF",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });
  
  // Process PDFs for semantic search embeddings
  const processEmbeddingsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/projects/${projectId}/process-pdfs-for-embeddings`);
    },
    onSuccess: () => {
      toast({
        title: "Semantic search enabled",
        description: "The PDF documents have been processed for semantic search.",
      });
      setIsProcessingEmbeddings(false);
    },
    onError: (error) => {
      toast({
        title: "Error processing the documents",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setIsProcessingEmbeddings(false);
    }
  });

  // The AI training function was removed because it is no longer used

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      // Convert the FileList into an array
      const fileArray = Array.from(files);

      // Check the formats against the same list the server validates against
      const unsupported = fileArray.filter(
        (file) => !isSupportedDocument(file.name, file.type),
      );
      if (unsupported.length > 0) {
        toast({
          title: "Invalid file format",
          description: `Accepted formats: ${listAcceptedExtensions()}.`,
          variant: "destructive",
        });
        return;
      }

      // Check file sizes (max 10MB each)
      const oversizedFiles = fileArray.filter(
        (file) => file.size > 10 * 1024 * 1024,
      );
      if (oversizedFiles.length > 0) {
        toast({
          title: "Some files are too large",
          description: `${oversizedFiles.length} file(s) exceed the 10 MB limit.`,
          variant: "destructive",
        });
        return;
      }

      // Store the selected files and show the weight dialog
      setSelectedFiles(fileArray);
      setShowWeightDialog(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // Convert the FileList into an array
      const fileArray = Array.from(files);

      // Check the formats against the same list the server validates against
      const unsupported = fileArray.filter(
        (file) => !isSupportedDocument(file.name, file.type),
      );
      if (unsupported.length > 0) {
        toast({
          title: "Invalid file format",
          description: `Accepted formats: ${listAcceptedExtensions()}.`,
          variant: "destructive",
        });
        return;
      }

      // Check file sizes (max 10MB each)
      const oversizedFiles = fileArray.filter(
        (file) => file.size > 10 * 1024 * 1024,
      );
      if (oversizedFiles.length > 0) {
        toast({
          title: "Some files are too large",
          description: `${oversizedFiles.length} file(s) exceed the 10 MB limit.`,
          variant: "destructive",
        });
        return;
      }

      // Store the selected files and show the weight dialog
      setSelectedFiles(fileArray);
      setShowWeightDialog(true);
    }
  };

  // Function for uploading with a weight
  const handleUploadWithWeight = () => {
    if (selectedFiles.length === 0) return;

    setUploadProgress(0);
    setShowWeightDialog(false);

    // Simulate upload progress for better UX
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev === null) return null;
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);

    // Adjust the text above to show the number of files
    toast({
      title: "Uploading documents",
      description: `Uploading ${selectedFiles.length} file(s) with weight ${documentWeight[0]}. This may take a moment.`,
    });

    // Start uploading all files with their weight
    uploadMutation.mutate({ files: selectedFiles, weight: documentWeight[0] });
  };

  return (
    <>
      <Card className="shadow overflow-hidden">
        <CardHeader>
          <CardTitle>Upload documents</CardTitle>
          <CardDescription>
            Upload the documents your chatbot will learn to answer from
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t border-gray-200 p-6">

          <div
            className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 ${
              uploadMutation.isPending
                ? "border-primary-300"
                : "border-gray-300"
            } border-dashed rounded-md cursor-pointer hover:border-gray-400`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="space-y-1 text-center">
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  <p className="mt-2 text-sm text-gray-600">
                    Uploading and processing the document...
                  </p>
                  {uploadProgress !== null && (
                    <div className="w-full mt-2 bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-primary h-2.5 rounded-full"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <FileIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                    >
                      <span>Upload documents</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        accept={acceptAttribute()}
                        multiple
                        ref={fileInputRef}
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">or drag them here</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {listAcceptedExtensions()} — multiple files, each up to 10MB
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-900">
              Uploaded files
            </h4>
            {isLoading ? (
              <div className="flex justify-center items-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : pdfs && pdfs.length > 0 ? (
              <>
                <ul className="mt-2 divide-y divide-gray-200">
                  {pdfs.map((pdf) => (
                    <li
                      key={pdf.id}
                      className="py-3 flex justify-between items-center"
                    >
                      <div className="flex items-center">
                        <FileIcon className="flex-shrink-0 h-5 w-5 text-gray-400" />
                        <div className="ml-2 flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {(() => {
                              // Function for decoding a file name from broken UTF-8
                              const decodeFilename = (filename: string) => {
                                if (!filename) return "Untitled document.pdf";
                                
                                try {
                                  // Convert the string back into a byte array and then decode it properly
                                  const bytes = new Uint8Array(filename.length);
                                  for (let i = 0; i < filename.length; i++) {
                                    bytes[i] = filename.charCodeAt(i);
                                  }
                                  const decoded = new TextDecoder('utf-8').decode(bytes);
                                  return decoded;
                                } catch (e) {
                                  // If decoding fails, fall back to basic replacement of known issues
                                  return filename
                                    .replace(/VÃ½/g, "Vý")
                                    .replace(/Å¡/g, "š")
                                    .replace(/â/g, "–")
                                    .replace(/Ã¡/g, "á")
                                    .replace(/Ã©/g, "é")
                                    .replace(/Ã­/g, "í")
                                    .replace(/Ã³/g, "ó")
                                    .replace(/Ãº/g, "ú")
                                    .replace(/Ã½/g, "ý")
                                    .replace(/Ä/g, "č")
                                    .replace(/Ä/g, "ď")
                                    .replace(/Ä/g, "ě")
                                    .replace(/Å/g, "ň")
                                    .replace(/Å/g, "ř")
                                    .replace(/Å¡/g, "š")
                                    .replace(/Å¥/g, "ť")
                                    .replace(/Å¯/g, "ů")
                                    .replace(/Å¾/g, "ž");
                                }
                              };
                              
                              return decodeFilename(pdf.filename);
                            })()}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-2">
                            <span>Weight: {pdf.weight || 5}</span>
                            <span>•</span>
                            <span>{formatDate(pdf.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0 flex">
                        <button
                          type="button"
                          className="font-medium text-gray-500 hover:text-gray-700"
                          onClick={() => setPdfToDelete(pdf.id)}
                        >
                          <Trash2Icon className="h-5 w-5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Button that enables semantic search over the documents */}
                <div className="mt-4">
                  <Button
                    onClick={() => {
                      setIsProcessingEmbeddings(true);
                      processEmbeddingsMutation.mutate();
                    }}
                    disabled={isProcessingEmbeddings || processEmbeddingsMutation.isPending}
                    className="w-full"
                    variant="outline"
                  >
                    {isProcessingEmbeddings || processEmbeddingsMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing documents...
                      </>
                    ) : (
                      <>
                        Enable semantic search
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-gray-500 mt-1 text-center">
                    Improves answers for large PDF documents
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-6 border border-dashed border-gray-300 rounded-md mt-2">
                <div className="flex justify-center">
                  <AlertCircle className="h-6 w-6 text-gray-400" />
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  No PDF files have been uploaded yet
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Weight Setting Dialog */}
      <Dialog open={showWeightDialog} onOpenChange={setShowWeightDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Document weight</DialogTitle>
            <DialogDescription>
              The weight controls how important the document is during search. A higher weight means higher priority.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Document weight: {documentWeight[0]}</Label>
              <Slider
                value={documentWeight}
                onValueChange={setDocumentWeight}
                min={1}
                max={10}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>Low (1)</span>
                <span>Medium (5)</span>
                <span>High (10)</span>
              </div>
            </div>
            <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
              <p><strong>Suggested values:</strong></p>
              <ul className="mt-1 text-xs space-y-1">
                <li>• <strong>1-3:</strong> Supplementary information, attachments</li>
                <li>• <strong>4-6:</strong> Standard documents</li>
                <li>• <strong>7-10:</strong> Key documents, manuals</li>
              </ul>
            </div>
            <div className="text-xs text-gray-500">
              Uploading: {selectedFiles.length} file(s)
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowWeightDialog(false);
                setSelectedFiles([]);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUploadWithWeight}>
              Upload with weight {documentWeight[0]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={pdfToDelete !== null}
        onOpenChange={() => setPdfToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat PDF?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you really want to delete this PDF file? This cannot be undone
              back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pdfToDelete !== null) {
                  deleteMutation.mutate(pdfToDelete);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Smazat"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
