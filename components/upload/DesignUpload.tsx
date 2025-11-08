// components/upload/DesignUpload.tsx
"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";

export default function DesignUpload() {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setMessage("");

    // Ask user for title and description
    const title = prompt("Design Title (required):");
    if (!title) {
      setMessage("Title is required!");
      setUploading(false);
      return;
    }
    const description = prompt("Description (optional):") || "";

    // Prepare form data
    const formData = new FormData();
    formData.append("design", file);
    formData.append("title", title);
    formData.append("description", description);

    try {
      const res = await fetch("/api/upload/design", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("Uploaded! Awaiting admin approval.");
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/svg+xml": [".svg"],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  return (
    <div className="max-w-lg mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-center">
        Upload Your Design
      </h2>

      <div
        {...getRootProps()}
        className={`border-4 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
          ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-blue-600 font-medium">Drop your design here!</p>
        ) : (
          <div>
            <p className="text-gray-700">Drag & drop your design here</p>
            <p className="text-sm text-gray-500 mt-2">or click to browse</p>
            <p className="text-xs text-gray-400 mt-4">
              PNG, JPG, SVG • Max 10MB
            </p>
          </div>
        )}
      </div>

      {uploading && (
        <p className="mt-4 text-center text-blue-600 animate-pulse">
          Uploading...
        </p>
      )}

      {message && (
        <p
          className={`mt-4 text-center font-medium ${
            message.includes("Error") || message.includes("failed")
              ? "text-red-600"
              : "text-green-600"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
