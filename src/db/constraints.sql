-- Database-level constraint for max 5 items per collection
CREATE OR REPLACE FUNCTION check_collection_item_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM collection_items WHERE collection_id = NEW.collection_id) >= 5 THEN
        RAISE EXCEPTION 'Collection cannot have more than 5 items';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_collection_item_limit
    BEFORE INSERT ON collection_items
    FOR EACH ROW
    EXECUTE FUNCTION check_collection_item_limit();