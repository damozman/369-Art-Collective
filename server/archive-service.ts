import type { IStorage } from "./storage";
import type { ArtworkWithArtist } from "@shared/schema";
import { EmailService } from "./lib/email-service";

export class ArchiveService {
  constructor(
    private storage: IStorage,
    private emailService: EmailService
  ) {}

  /**
   * Run the full archive workflow:
   * 1. Send warning emails for artworks approaching archive date
   * 2. Archive artworks that have exceeded the inactivity threshold
   */
  async runArchiveWorkflow(): Promise<{
    warningsSent: number;
    artworksArchived: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    // Send warning emails (30 days before archiving)
    const warningsSent = await this.sendArchiveWarnings();
    
    // Archive eligible artworks
    const artworksArchived = await this.archiveInactiveArtworks();
    
    return {
      warningsSent,
      artworksArchived,
      errors,
    };
  }

  /**
   * Send warning emails to artists whose artwork will be archived in 30 days
   */
  private async sendArchiveWarnings(): Promise<number> {
    const MONTHS_INACTIVE = 18;
    const WARNING_DAYS_BEFORE = 30;
    
    try {
      const artworksNeedingWarning = await this.storage.getArtworksEligibleForArchiveWarning(
        MONTHS_INACTIVE,
        WARNING_DAYS_BEFORE
      );
      
      console.log(`Found ${artworksNeedingWarning.length} artworks eligible for archive warning`);
      
      let sentCount = 0;
      
      for (const artwork of artworksNeedingWarning) {
        try {
          // Send warning email
          await this.emailService.sendArtworkArchiveWarning(
            artwork.artist.email,
            artwork.artist.name,
            artwork.title,
            artwork.id
          );
          
          // Mark warning as sent
          await this.storage.updateArtwork(artwork.id, {
            archiveWarningEmailSentAt: new Date(),
          });
          
          sentCount++;
          console.log(`✓ Archive warning sent for artwork: ${artwork.title}`);
        } catch (error) {
          console.error(`Failed to send archive warning for artwork ${artwork.id}:`, error);
        }
      }
      
      return sentCount;
    } catch (error) {
      console.error("Error in sendArchiveWarnings:", error);
      return 0;
    }
  }

  /**
   * Archive artworks that have been inactive for 18 months
   */
  private async archiveInactiveArtworks(): Promise<number> {
    const MONTHS_INACTIVE = 18;
    
    try {
      const eligibleArtworks = await this.storage.getArtworksEligibleForArchive(MONTHS_INACTIVE);
      
      console.log(`Found ${eligibleArtworks.length} artworks eligible for archiving`);
      
      let archivedCount = 0;
      
      for (const artwork of eligibleArtworks) {
        try {
          // Archive the artwork
          await this.storage.archiveArtwork(artwork.id);
          
          // Send notification email
          await this.emailService.sendArtworkArchivedNotification(
            artwork.artist.email,
            artwork.artist.name,
            artwork.title,
            artwork.id
          );
          
          archivedCount++;
          console.log(`✓ Artwork archived: ${artwork.title}`);
        } catch (error) {
          console.error(`Failed to archive artwork ${artwork.id}:`, error);
        }
      }
      
      return archivedCount;
    } catch (error) {
      console.error("Error in archiveInactiveArtworks:", error);
      return 0;
    }
  }

  /**
   * Reactivate an archived artwork (artist-initiated or admin override)
   */
  async reactivateArtwork(artworkId: string): Promise<void> {
    try {
      await this.storage.reactivateArtwork(artworkId);
      console.log(`✓ Artwork reactivated: ${artworkId}`);
    } catch (error) {
      console.error(`Failed to reactivate artwork ${artworkId}:`, error);
      throw error;
    }
  }

  /**
   * Get summary stats about archived artworks
   */
  async getArchiveStats(): Promise<{
    totalArchived: number;
    artworks: ArtworkWithArtist[];
  }> {
    const archived = await this.storage.getArchivedArtworks();
    return {
      totalArchived: archived.length,
      artworks: archived,
    };
  }
}
