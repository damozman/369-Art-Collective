// pages/index.tsx
import DesignUpload from "@/components/upload/DesignUpload";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="max-w-2xl mx-auto text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">
          247 Print Network
        </h1>
        <p className="text-lg text-gray-600">
          Upload your design to get started
        </p>
      </div>
      <DesignUpload />
    </div>
  );
}
