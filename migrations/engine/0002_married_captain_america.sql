CREATE TYPE "public"."engine_subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TABLE "engine_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"plan_key" text NOT NULL,
	"status" "engine_subscription_status" DEFAULT 'trialing' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"trial_ends_at" timestamp,
	"overage_noticed_at" timestamp,
	"overage_people_count" integer,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"last_payment_error" text,
	"canceled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engine_subscriptions" ADD CONSTRAINT "engine_subscriptions_tenant_id_engine_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."engine_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engine_subscriptions_tenant_unique" ON "engine_subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_subscriptions_stripe_sub_unique" ON "engine_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "engine_subscriptions_status_idx" ON "engine_subscriptions" USING btree ("status");