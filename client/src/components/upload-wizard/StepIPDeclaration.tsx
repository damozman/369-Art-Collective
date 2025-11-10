import { UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { AlertTriangle } from "lucide-react";
import type { WizardFormData } from "./ArtworkUploadWizard";

interface StepIPDeclarationProps {
  form: UseFormReturn<WizardFormData>;
}

export function StepIPDeclaration({ form }: StepIPDeclarationProps) {
  return (
    <div className="space-y-6">
      <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
              Important Legal Notice
            </h4>
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Uploading artwork that violates intellectual property rights is illegal and will result in immediate removal 
              from the platform and forfeiture of all pending earnings. This includes but is not limited to:
            </p>
            <ul className="text-xs text-yellow-800 dark:text-yellow-200 mt-2 space-y-1 ml-4">
              <li>• Copyrighted characters, logos, or brand imagery</li>
              <li>• Trademarked designs or slogans</li>
              <li>• Artwork you do not own or have rights to</li>
              <li>• Derivative works without proper licensing</li>
            </ul>
          </div>
        </div>
      </div>

      <FormField
        control={form.control}
        name="ipDeclarationAccepted"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
                data-testid="checkbox-ip-declaration"
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel className="text-sm font-medium">
                Intellectual Property Declaration
              </FormLabel>
              <p className="text-xs text-muted-foreground mt-2">
                I confirm that I own the rights to this artwork and it does not violate any trademarks, copyrights, 
                or other intellectual property rights. I understand that uploading artwork containing brand logos, 
                copyrighted characters, or other protected content will result in immediate removal and forfeiture 
                of any pending earnings.
              </p>
              <FormMessage />
            </div>
          </FormItem>
        )}
      />

      <div className="p-4 bg-muted rounded-lg">
        <p className="text-xs text-muted-foreground">
          By checking this box, you legally affirm that you have the right to use and sell this artwork. 
          Your IP address and timestamp will be recorded for legal purposes.
        </p>
      </div>
    </div>
  );
}
