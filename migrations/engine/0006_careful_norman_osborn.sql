CREATE TYPE "public"."engine_advance_status" AS ENUM('open', 'written_off', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."engine_ledger_entry_type" ADD VALUE 'advance_recoupment';--> statement-breakpoint
CREATE TABLE "engine_advances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"contributor_id" varchar NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"recoupment_basis_points" integer DEFAULT 10000 NOT NULL,
	"work_id" varchar,
	"status" "engine_advance_status" DEFAULT 'open' NOT NULL,
	"issued_at" timestamp NOT NULL,
	"note" text,
	"closed_at" timestamp,
	"closed_by" varchar,
	"close_note" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engine_ledger_entries" ADD COLUMN "advance_id" varchar;--> statement-breakpoint
ALTER TABLE "engine_advances" ADD CONSTRAINT "engine_advances_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_advances" ADD CONSTRAINT "engine_advances_contributor_id_engine_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."engine_contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_advances" ADD CONSTRAINT "engine_advances_work_id_engine_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."engine_works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_advances" ADD CONSTRAINT "engine_advances_closed_by_engine_tenant_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."engine_tenant_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_advances" ADD CONSTRAINT "engine_advances_created_by_engine_tenant_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."engine_tenant_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engine_advances_tenant_idx" ON "engine_advances" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "engine_advances_contributor_idx" ON "engine_advances" USING btree ("tenant_id","contributor_id","status");--> statement-breakpoint
CREATE INDEX "engine_advances_issued_idx" ON "engine_advances" USING btree ("tenant_id","issued_at");--> statement-breakpoint
ALTER TABLE "engine_ledger_entries" ADD CONSTRAINT "engine_ledger_entries_advance_id_engine_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."engine_advances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engine_ledger_advance_idx" ON "engine_ledger_entries" USING btree ("advance_id");