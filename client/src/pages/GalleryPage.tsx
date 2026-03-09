import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Image as ImageIcon, Download, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GalleryImage {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  imageData: string;
  createdAt: string;
}

export default function GalleryPage() {
  const [, navigate] = useLocation();

  const { data: images, isLoading } = useQuery<GalleryImage[]>({
    queryKey: ["/api/gallery"],
  });

  const handleDownload = (imageData: string, index: number) => {
    const mimeMatch = imageData.match(/data:([^;]+);/);
    const ext = mimeMatch ? mimeMatch[1].split("/")[1] ?? "png" : "png";
    const a = document.createElement("a");
    a.href = imageData;
    a.download = `generated-image-${index + 1}.${ext}`;
    a.click();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="shrink-0"
            data-testid="button-back-gallery"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Image Gallery</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              All AI-generated images from your conversations
            </p>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {images && `${images.length} image${images.length !== 1 ? "s" : ""}`}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!images || images.length === 0) && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              <ImageIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">No images yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Generate images in a chat by clicking the ✨ Sparkles button in the input bar
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Start a chat
            </Button>
          </div>
        )}

        {/* Grid */}
        {images && images.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img, i) => (
              <div
                key={img.messageId}
                data-testid={`card-gallery-${img.messageId}`}
                className="group relative rounded-2xl overflow-hidden border border-border/40 bg-muted/20 hover:border-border/80 transition-all duration-200 hover:shadow-lg"
              >
                <div className="aspect-square overflow-hidden bg-black/20">
                  <img
                    src={img.imageData}
                    alt={`Generated image from ${img.conversationTitle}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>

                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 gap-2">
                  <p className="text-xs text-white font-medium truncate">{img.conversationTitle}</p>
                  <p className="text-[10px] text-white/70">{formatDate(img.createdAt)}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(img.imageData, i)}
                      data-testid={`button-download-image-${img.messageId}`}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-lg py-1.5 transition-colors backdrop-blur-sm"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </button>
                    <button
                      onClick={() => navigate(`/?conv=${img.conversationId}`)}
                      data-testid={`button-open-conv-${img.messageId}`}
                      className="flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-lg px-2.5 py-1.5 transition-colors backdrop-blur-sm"
                    >
                      <MessageSquare className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Date badge */}
                <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] rounded-md px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatDate(img.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
