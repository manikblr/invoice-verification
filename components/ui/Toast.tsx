/**
 * Minimal toast notification system
 * Shows success/error messages with auto-dismiss
 */

'use client';

import { useState, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

/**
 * Individual toast component
 */
function ToastItem({ toast, onDismiss }: ToastProps): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 4000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const getToastStyles = (type: ToastType): string => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300';
    }
  };

  const getIcon = (type: ToastType): JSX.Element => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <div className={`border rounded-lg p-4 shadow-lg max-w-sm w-full ${getToastStyles(toast.type)}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {getIcon(toast.type)}
        </div>
        <div className="ml-3 w-0 flex-1">
          <p className="text-sm font-medium">
            {toast.message}
          </p>
        </div>
        <div className="ml-4 flex-shrink-0 flex">
          <button
            type="button"
            className="inline-flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            onClick={() => onDismiss(toast.id)}
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Global toast state management
let toasts: Toast[] = [];
let listeners: Array<(toasts: Toast[]) => void> = [];

/**
 * Add a toast notification
 */
export function addToast(type: ToastType, message: string, duration?: number): void {
  const toast: Toast = {
    id: Math.random().toString(36).substr(2, 9),
    type,
    message,
    duration,
  };

  toasts = [...toasts, toast];
  listeners.forEach(listener => listener(toasts));
}

/**
 * Remove a toast notification
 */
function removeToast(id: string): void {
  toasts = toasts.filter(toast => toast.id !== id);
  listeners.forEach(listener => listener(toasts));
}

/**
 * Toast container component
 */
export function ToastContainer(): JSX.Element {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => {
      setCurrentToasts(newToasts);
    };

    listeners.push(listener);
    setCurrentToasts(toasts);

    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, []);

  if (currentToasts.length === 0) {
    return <></>;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {currentToasts.map(toast => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={removeToast}
        />
      ))}
    </div>
  );
}

// Convenience functions
export const toast = {
  success: (message: string, duration?: number) => addToast('success', message, duration),
  error: (message: string, duration?: number) => addToast('error', message, duration),
  info: (message: string, duration?: number) => addToast('info', message, duration),
};