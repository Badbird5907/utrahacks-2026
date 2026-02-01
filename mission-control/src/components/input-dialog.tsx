"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
}

export function InputDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  defaultValue = "",
  submitLabel = "Create",
  onSubmit,
}: InputDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(defaultValue);
      // Focus input after dialog animation
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open, defaultValue]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      onOpenChange(false);
    }
  }, [value, onSubmit, onOpenChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-2">
            {label && <Label htmlFor="input-dialog-value">{label}</Label>}
            <Input
              ref={inputRef}
              id="input-dialog-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!value.trim()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hook for easier usage with callbacks
interface UseInputDialogOptions {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
}

interface UseInputDialogReturn {
  dialog: React.ReactNode;
  open: (onSubmit: (value: string) => void) => void;
}

export function useInputDialog(
  options: UseInputDialogOptions
): UseInputDialogReturn {
  const [isOpen, setIsOpen] = useState(false);
  const onSubmitRef = useRef<((value: string) => void) | null>(null);

  const open = useCallback((onSubmit: (value: string) => void) => {
    onSubmitRef.current = onSubmit;
    setIsOpen(true);
  }, []);

  const handleSubmit = useCallback((value: string) => {
    onSubmitRef.current?.(value);
    onSubmitRef.current = null;
  }, []);

  const dialog = (
    <InputDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      title={options.title}
      description={options.description}
      label={options.label}
      placeholder={options.placeholder}
      defaultValue={options.defaultValue}
      submitLabel={options.submitLabel}
      onSubmit={handleSubmit}
    />
  );

  return { dialog, open };
}
