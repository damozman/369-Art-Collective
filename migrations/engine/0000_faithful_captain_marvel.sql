CREATE TYPE "public"."engine_adjustment_reason" AS ENUM('manual_correction', 'bonus', 'clawback_recoup', 'write_off');--> statement-breakpoint
CREATE TYPE "public"."engine_clawback_policy" AS ENUM('recoup', 'absorb', 'reserve');--> statement-breakpoint
CREATE TYPE "public"."engine_event_direction" AS ENUM('sale', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."engine_event_source" AS ENUM('shopify', 'stripe', 'csv', 'manual');--> statement-breakpoint
CREATE TYPE "public"."engine_ledger_entry_type" AS ENUM('allocation', 'reversal', 'adjustment', 'payout', 'payout_reversal');--> statement-breakpoint
CREATE TYPE "public"."engine_payout_batch_status" AS ENUM('open', 'processing', 'completed', 'completed_with_failures', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."engine_payout_status" AS ENUM('pending', 'processing', 'paid', 'failed', 'retrying', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."engine_rule_basis" AS ENUM('gross', 'net', 'unit');--> statement-breakpoint
CREATE TYPE "public"."engine_rule_method" AS ENUM('percent', 'flat_per_unit', 'flat_per_event', 'tiered');--> statement-breakpoint
CREATE TYPE "public"."engine_rule_scope" AS ENUM('tenant', 'contributor', 'work', 'product_type');--> statement-breakpoint
CREATE TYPE "public"."engine_tax_identity_status" AS ENUM('not_collected', 'pending', 'collected', 'invalid');--> statement-breakpoint
CREATE TABLE "engine_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"contributor_id" varchar NOT NULL,
	"reason" "engine_adjustment_reason" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"note" text,
	"related_allocation_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"revenue_event_id" varchar NOT NULL,
	"contributor_id" varchar NOT NULL,
	"split_rule_id" varchar,
	"rule_key" varchar,
	"rule_version" integer,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"gross_amount_minor" bigint NOT NULL,
	"deducted_costs_minor" bigint DEFAULT 0 NOT NULL,
	"basis_amount_minor" bigint NOT NULL,
	"basis" "engine_rule_basis" NOT NULL,
	"method" "engine_rule_method" NOT NULL,
	"rate_basis_points" integer,
	"explanation" text,
	"trace" jsonb,
	"reverses_allocation_id" varchar,
	"calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" varchar,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar,
	"before" jsonb,
	"after" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_contributor_identities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"contributor_id" varchar NOT NULL,
	"stripe_account_id" text,
	"stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
	"stripe_requirements" jsonb,
	"tax_form_type" text,
	"tax_identity_status" "engine_tax_identity_status" DEFAULT 'not_collected' NOT NULL,
	"tax_identity_collected_at" timestamp,
	"payout_currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_contributors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"external_ref" text,
	"password_hash" text,
	"last_login_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_cost_components" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"revenue_event_id" varchar NOT NULL,
	"type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"source" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_ledger_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"contributor_id" varchar NOT NULL,
	"entry_type" "engine_ledger_entry_type" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"allocation_id" varchar,
	"payout_id" varchar,
	"adjustment_id" varchar,
	"available_at" timestamp,
	"description" text,
	"occurred_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_payout_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"status" "engine_payout_batch_status" DEFAULT 'open' NOT NULL,
	"available_as_of" timestamp NOT NULL,
	"currency" text NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_payouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"batch_id" varchar,
	"contributor_id" varchar NOT NULL,
	"status" "engine_payout_status" DEFAULT 'pending' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"reserve_held_minor" bigint DEFAULT 0 NOT NULL,
	"reserve_release_at" timestamp,
	"stripe_transfer_id" text,
	"failure_reason" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"initiated_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_revenue_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"source" "engine_event_source" NOT NULL,
	"source_event_id" text NOT NULL,
	"direction" "engine_event_direction" DEFAULT 'sale' NOT NULL,
	"reverses_event_id" varchar,
	"occurred_at" timestamp NOT NULL,
	"gross_amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"work_id" varchar,
	"work_ref" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"metadata" jsonb,
	"ingested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_split_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"rule_key" varchar NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp NOT NULL,
	"effective_to" timestamp,
	"scope" "engine_rule_scope" NOT NULL,
	"scope_ref" text,
	"contributor_id" varchar,
	"role" text,
	"basis" "engine_rule_basis" NOT NULL,
	"method" "engine_rule_method" NOT NULL,
	"value_basis_points" integer,
	"value_minor" bigint,
	"tier_table" jsonb,
	"cost_deductions" text[] DEFAULT ARRAY[]::text[],
	"priority" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "engine_tenant_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"last_login_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_tenants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"stripe_account_id" text,
	"clawback_policy" "engine_clawback_policy" DEFAULT 'recoup' NOT NULL,
	"payout_hold_days" integer DEFAULT 14 NOT NULL,
	"minimum_payout_minor" bigint DEFAULT 1000 NOT NULL,
	"reserve_basis_points" integer DEFAULT 0 NOT NULL,
	"reserve_release_days" integer DEFAULT 90 NOT NULL,
	"offboarding_requested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_work_contributors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"work_id" varchar NOT NULL,
	"contributor_id" varchar NOT NULL,
	"role" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_works" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"title" text NOT NULL,
	"external_ref" text,
	"product_type" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engine_adjustments" ADD CONSTRAINT "engine_adjustments_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_adjustments" ADD CONSTRAINT "engine_adjustments_contributor_id_engine_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."engine_contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_adjustments" ADD CONSTRAINT "engine_adjustments_related_allocation_id_engine_allocations_id_fk" FOREIGN KEY ("related_allocation_id") REFERENCES "public"."engine_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_adjustments" ADD CONSTRAINT "engine_adjustments_created_by_engine_tenant_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."engine_tenant_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_allocations" ADD CONSTRAINT "engine_allocations_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_allocations" ADD CONSTRAINT "engine_allocations_revenue_event_id_engine_revenue_events_id_fk" FOREIGN KEY ("revenue_event_id") REFERENCES "public"."engine_revenue_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_allocations" ADD CONSTRAINT "engine_allocations_contributor_id_engine_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."engine_contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_allocations" ADD CONSTRAINT "engine_allocations_split_rule_id_engine_split_rules_id_fk" FOREIGN KEY ("split_rule_id") REFERENCES "public"."engine_split_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_allocations" ADD CONSTRAINT "engine_allocations_reverses_allocation_id_engine_allocations_id_fk" FOREIGN KEY ("reverses_allocation_id") REFERENCES "public"."engine_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_audit_log" ADD CONSTRAINT "engine_audit_log_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_contributor_identities" ADD CONSTRAINT "engine_contributor_identities_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_contributor_identities" ADD CONSTRAINT "engine_contributor_identities_contributor_id_engine_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."engine_contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_contributors" ADD CONSTRAINT "engine_contributors_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_cost_components" ADD CONSTRAINT "engine_cost_components_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_cost_components" ADD CONSTRAINT "engine_cost_components_revenue_event_id_engine_revenue_events_id_fk" FOREIGN KEY ("revenue_event_id") REFERENCES "public"."engine_revenue_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_ledger_entries" ADD CONSTRAINT "engine_ledger_entries_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_ledger_entries" ADD CONSTRAINT "engine_ledger_entries_contributor_id_engine_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."engine_contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_ledger_entries" ADD CONSTRAINT "engine_ledger_entries_allocation_id_engine_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."engine_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_ledger_entries" ADD CONSTRAINT "engine_ledger_entries_payout_id_engine_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."engine_payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_ledger_entries" ADD CONSTRAINT "engine_ledger_entries_adjustment_id_engine_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."engine_adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_payout_batches" ADD CONSTRAINT "engine_payout_batches_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_payout_batches" ADD CONSTRAINT "engine_payout_batches_created_by_engine_tenant_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."engine_tenant_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_payouts" ADD CONSTRAINT "engine_payouts_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_payouts" ADD CONSTRAINT "engine_payouts_batch_id_engine_payout_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."engine_payout_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_payouts" ADD CONSTRAINT "engine_payouts_contributor_id_engine_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."engine_contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_revenue_events" ADD CONSTRAINT "engine_revenue_events_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_revenue_events" ADD CONSTRAINT "engine_revenue_events_reverses_event_id_engine_revenue_events_id_fk" FOREIGN KEY ("reverses_event_id") REFERENCES "public"."engine_revenue_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_revenue_events" ADD CONSTRAINT "engine_revenue_events_work_id_engine_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."engine_works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_split_rules" ADD CONSTRAINT "engine_split_rules_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_split_rules" ADD CONSTRAINT "engine_split_rules_contributor_id_engine_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."engine_contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_split_rules" ADD CONSTRAINT "engine_split_rules_created_by_engine_tenant_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."engine_tenant_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_tenant_users" ADD CONSTRAINT "engine_tenant_users_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_work_contributors" ADD CONSTRAINT "engine_work_contributors_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_work_contributors" ADD CONSTRAINT "engine_work_contributors_work_id_engine_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."engine_works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_work_contributors" ADD CONSTRAINT "engine_work_contributors_contributor_id_engine_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."engine_contributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_works" ADD CONSTRAINT "engine_works_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engine_adjustments_tenant_idx" ON "engine_adjustments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "engine_adjustments_contributor_idx" ON "engine_adjustments" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "engine_allocations_tenant_idx" ON "engine_allocations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "engine_allocations_event_idx" ON "engine_allocations" USING btree ("revenue_event_id");--> statement-breakpoint
CREATE INDEX "engine_allocations_contributor_idx" ON "engine_allocations" USING btree ("tenant_id","contributor_id");--> statement-breakpoint
CREATE INDEX "engine_allocations_reverses_idx" ON "engine_allocations" USING btree ("reverses_allocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_allocations_event_contributor_rule_unique" ON "engine_allocations" USING btree ("revenue_event_id","contributor_id","split_rule_id");--> statement-breakpoint
CREATE INDEX "engine_audit_tenant_occurred_idx" ON "engine_audit_log" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "engine_audit_entity_idx" ON "engine_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_contributor_identities_contributor_unique" ON "engine_contributor_identities" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "engine_contributor_identities_tenant_idx" ON "engine_contributor_identities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "engine_contributors_tenant_idx" ON "engine_contributors" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_contributors_tenant_ref_unique" ON "engine_contributors" USING btree ("tenant_id","external_ref");--> statement-breakpoint
CREATE INDEX "engine_contributors_tenant_email_idx" ON "engine_contributors" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_cost_components_event_type_unique" ON "engine_cost_components" USING btree ("revenue_event_id","type");--> statement-breakpoint
CREATE INDEX "engine_cost_components_tenant_idx" ON "engine_cost_components" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "engine_ledger_contributor_balance_idx" ON "engine_ledger_entries" USING btree ("tenant_id","contributor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "engine_ledger_available_idx" ON "engine_ledger_entries" USING btree ("tenant_id","available_at");--> statement-breakpoint
CREATE INDEX "engine_ledger_allocation_idx" ON "engine_ledger_entries" USING btree ("allocation_id");--> statement-breakpoint
CREATE INDEX "engine_ledger_payout_idx" ON "engine_ledger_entries" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "engine_payout_batches_tenant_idx" ON "engine_payout_batches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "engine_payouts_tenant_idx" ON "engine_payouts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "engine_payouts_contributor_idx" ON "engine_payouts" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "engine_payouts_batch_idx" ON "engine_payouts" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_payouts_stripe_transfer_unique" ON "engine_payouts" USING btree ("stripe_transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_revenue_events_source_unique" ON "engine_revenue_events" USING btree ("tenant_id","source","source_event_id");--> statement-breakpoint
CREATE INDEX "engine_revenue_events_tenant_occurred_idx" ON "engine_revenue_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "engine_revenue_events_tenant_review_idx" ON "engine_revenue_events" USING btree ("tenant_id","needs_review");--> statement-breakpoint
CREATE INDEX "engine_revenue_events_reverses_idx" ON "engine_revenue_events" USING btree ("reverses_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_split_rules_key_version_unique" ON "engine_split_rules" USING btree ("tenant_id","rule_key","version");--> statement-breakpoint
CREATE INDEX "engine_split_rules_tenant_active_idx" ON "engine_split_rules" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "engine_split_rules_tenant_effective_idx" ON "engine_split_rules" USING btree ("tenant_id","effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_tenant_users_tenant_email_unique" ON "engine_tenant_users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "engine_tenant_users_tenant_idx" ON "engine_tenant_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_tenants_slug_unique" ON "engine_tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_work_contributors_unique" ON "engine_work_contributors" USING btree ("work_id","contributor_id","role");--> statement-breakpoint
CREATE INDEX "engine_work_contributors_tenant_idx" ON "engine_work_contributors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "engine_work_contributors_contributor_idx" ON "engine_work_contributors" USING btree ("contributor_id");--> statement-breakpoint
CREATE INDEX "engine_works_tenant_idx" ON "engine_works" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_works_tenant_ref_unique" ON "engine_works" USING btree ("tenant_id","external_ref");