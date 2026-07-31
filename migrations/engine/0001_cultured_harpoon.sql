CREATE TYPE "public"."engine_connection_status" AS ENUM('pending', 'active', 'disconnected', 'revoked', 'error');--> statement-breakpoint
CREATE TABLE "engine_source_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"external_ref" text NOT NULL,
	"label" text,
	"status" "engine_connection_status" DEFAULT 'pending' NOT NULL,
	"credential_sealed" text,
	"webhook_secret_sealed" text,
	"scopes" jsonb,
	"settings" jsonb,
	"last_error_at" timestamp,
	"last_error" text,
	"last_event_at" timestamp,
	"connected_at" timestamp,
	"disconnected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engine_source_connections" ADD CONSTRAINT "engine_source_connections_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engine_source_connections_provider_ref_unique" ON "engine_source_connections" USING btree ("provider","external_ref");--> statement-breakpoint
CREATE INDEX "engine_source_connections_tenant_provider_idx" ON "engine_source_connections" USING btree ("tenant_id","provider");