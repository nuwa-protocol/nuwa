 -- Migration script to support text chunking for knowledge embeddings

-- Add chunk-related columns to knowledge_embeddings table
ALTER TABLE knowledge_embeddings 
  ADD COLUMN IF NOT EXISTS chunk_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_id TEXT,
  ADD COLUMN IF NOT EXISTS is_chunk BOOLEAN DEFAULT FALSE;

-- Drop the unique constraint on airtable_id
ALTER TABLE knowledge_embeddings DROP CONSTRAINT IF EXISTS knowledge_embeddings_airtable_id_key;

-- Create a new combined unique constraint on airtable_id and chunk_index
ALTER TABLE knowledge_embeddings 
  ADD CONSTRAINT knowledge_embeddings_airtable_id_chunk_index_key 
  UNIQUE (airtable_id, chunk_index);

-- Create index on parent_id for faster chunk lookup
CREATE INDEX IF NOT EXISTS knowledge_embeddings_parent_id_idx ON knowledge_embeddings(parent_id);

-- Create index on is_chunk for filtering chunks
CREATE INDEX IF NOT EXISTS knowledge_embeddings_is_chunk_idx ON knowledge_embeddings(is_chunk);

-- Update similarity matching function to handle chunks
CREATE OR REPLACE FUNCTION match_knowledge_embeddings(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  airtable_id TEXT,
  title TEXT,
  content TEXT,
  description TEXT,
  tags TEXT[],
  content_hash TEXT,
  last_modified_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  similarity FLOAT,
  chunk_index INTEGER,
  parent_id TEXT,
  is_chunk BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- First, get all matching chunks
  CREATE TEMP TABLE chunk_matches ON COMMIT DROP AS
  SELECT
    ke.id,
    ke.airtable_id,
    ke.title,
    ke.content,
    ke.description,
    ke.tags,
    ke.content_hash,
    ke.last_modified_time,
    ke.created_at,
    ke.updated_at,
    1 - (ke.embedding <=> query_embedding) AS similarity,
    ke.chunk_index,
    ke.parent_id,
    ke.is_chunk
  FROM
    knowledge_embeddings ke
  WHERE
    1 - (ke.embedding <=> query_embedding) > match_threshold
  ORDER BY
    ke.embedding <=> query_embedding;
  
  -- Return chunked results if any, otherwise return normal results
  RETURN QUERY
  SELECT * FROM chunk_matches
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;