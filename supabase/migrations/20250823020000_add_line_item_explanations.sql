-- Migration: Add line_item_explanations table for explanation flow
-- Phase 5: Rule Agent + Explanation Loop

-- Create line_item_explanations table
create table if not exists line_item_explanations (
  id bigserial primary key,
  line_item_id bigint not null references invoice_line_items(id) on delete cascade,
  explanation_text text not null,
  submitted_by text, -- User identifier or email
  submitted_at timestamp with time zone default now() not null,
  
  -- Agent verification results
  verification_status text check (verification_status in ('pending', 'accepted', 'rejected')) default 'pending',
  verification_agent_run_id text, -- Reference to agent run that verified
  accepted boolean, -- Final decision: true = accepted, false = rejected
  rejected_reason text, -- Reason if rejected
  
  -- Clarity evaluation (optional judge scoring)
  clarity_score decimal(3,2), -- 0.00 to 1.00
  clarity_evaluation text, -- Judge feedback on explanation clarity
  
  -- Metadata
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Add indexes for performance
create index if not exists idx_line_item_explanations_line_item_id on line_item_explanations(line_item_id);
create index if not exists idx_line_item_explanations_status on line_item_explanations(verification_status);
create index if not exists idx_line_item_explanations_submitted_at on line_item_explanations(submitted_at);

-- Add updated_at trigger
drop trigger if exists update_line_item_explanations_updated_at on line_item_explanations;
create trigger update_line_item_explanations_updated_at
    before update on line_item_explanations
    for each row
    execute function update_updated_at_column();

-- Add comments for documentation
comment on table line_item_explanations is 'Stores user explanations for line items that need additional context or justification';
comment on column line_item_explanations.line_item_id is 'Reference to the line item requiring explanation';
comment on column line_item_explanations.explanation_text is 'User-provided explanation or justification for the line item';
comment on column line_item_explanations.submitted_by is 'User identifier who submitted the explanation';
comment on column line_item_explanations.verification_status is 'Current status of agent verification: pending, accepted, rejected';
comment on column line_item_explanations.accepted is 'Final verification decision by the rule agent';
comment on column line_item_explanations.rejected_reason is 'Detailed reason if explanation was rejected by agent';
comment on column line_item_explanations.clarity_score is 'Optional judge score for explanation clarity (0.00-1.00)';
comment on column line_item_explanations.clarity_evaluation is 'Optional judge feedback on explanation quality';

-- Add RLS (Row Level Security) policies if needed
alter table line_item_explanations enable row level security;

-- Policy: Users can read their own explanations (if user system is implemented)
-- For now, allow all authenticated access
create policy "Allow authenticated read access" on line_item_explanations
  for select using (true);

create policy "Allow authenticated insert access" on line_item_explanations
  for insert with check (true);

create policy "Allow authenticated update access" on line_item_explanations
  for update using (true);

-- Add constraint to ensure one active explanation per line item
-- (Multiple explanations allowed but only one should be in 'pending' status at a time)
create unique index if not exists idx_line_item_explanations_unique_pending 
on line_item_explanations(line_item_id) 
where verification_status = 'pending';

-- Insert sample data for testing (optional)
-- insert into line_item_explanations (line_item_id, explanation_text, submitted_by, verification_status)
-- select id, 'This is a test explanation for line item', 'test_user', 'pending'
-- from invoice_line_items 
-- where status = 'NEEDS_EXPLANATION'
-- limit 1
-- on conflict do nothing;