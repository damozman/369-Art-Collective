CREATE TABLE "engine_email_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error" text,
	"provider_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engine_email_log" ADD CONSTRAINT "engine_email_log_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engine_email_log_tenant_dedupe_unique" ON "engine_email_log" USING btree ("tenant_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "engine_email_log_tenant_created_idx" ON "engine_email_log" USING btree ("tenant_id","created_at");