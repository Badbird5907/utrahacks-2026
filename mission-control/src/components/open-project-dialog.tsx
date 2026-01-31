"use client";

import { useState } from "react";
import { FolderOpen, AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useProjectStore } from "@/lib/project-state";

interface OpenProjectDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function OpenProjectDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: OpenProjectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [sketchPath, setSketchPath] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openProject = useProjectStore((state) => state.openProject);

  // Support both controlled and uncontrolled modes
  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = controlledOnOpenChange ?? setInternalOpen;

  const handleOpen = async () => {
    if (!sketchPath.trim()) {
      setError("Please enter a sketch path");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const success = await openProject(sketchPath.trim());
      if (success) {
        setIsOpen(false);
        setSketchPath("");
      } else {
        // Error is set in the store
        const storeError = useProjectStore.getState().error;
        setError(storeError || "Failed to open project");
      }
    } catch (err: any) {
      setError(err.message || "Failed to open project");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      handleOpen();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Open Arduino Project
          </DialogTitle>
          <DialogDescription>
            Enter the full path to your Arduino sketch folder. The folder should
            contain a .ino file with the same name as the folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sketchPath">Sketch Folder Path</Label>
            <Input
              id="sketchPath"
              placeholder="C:\Users\...\Documents\Arduino\MySketch"
              value={sketchPath}
              onChange={(e) => setSketchPath(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Example: C:\Users\username\Documents\Arduino\Blink
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleOpen} disabled={isLoading || !sketchPath.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening...
              </>
            ) : (
              "Open Project"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
