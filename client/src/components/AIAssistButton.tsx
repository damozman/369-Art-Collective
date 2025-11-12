import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AIAssistButtonProps {
  onGenerate: () => Promise<void>;
  tooltip: string;
  disabled?: boolean;
  className?: string;
}

export function AIAssistButton({
  onGenerate,
  tooltip,
  disabled = false,
  className = "",
}: AIAssistButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClick = async () => {
    setIsGenerating(true);
    try {
      await onGenerate();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClick}
          disabled={disabled || isGenerating}
          className={className}
          data-testid="button-ai-assist"
        >
          <Sparkles className={`h-4 w-4 ${isGenerating ? 'animate-pulse text-primary' : 'text-muted-foreground'}`} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isGenerating ? "Generating..." : tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
