CREATE TYPE "public"."engine_reset_subject" AS ENUM('contributor', 'tenant_user');--> statement-breakpoint
CREATE TABLE "engine_password_resets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"subject" "engine_reset_subject" NOT NULL,
	"subject_id" varchar NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"requested_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engine_password_resets" ADD CONSTRAINT "engine_password_resets_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engine_password_resets_token_unique" ON "engine_password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "engine_password_resets_subject_idx" ON "engine_password_resets" USING btree ("subject","subject_id");--> statement-breakpoint
CREATE INDEX "engine_password_resets_expires_idx" ON "engine_password_resets" USING btree ("expires_at");