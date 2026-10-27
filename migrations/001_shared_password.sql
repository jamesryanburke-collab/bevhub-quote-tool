PRAGMA foreign_keys=ON;
CREATE TABLE records(
 kind TEXT NOT NULL CHECK(kind IN ('quote','client')),
 id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
 payload TEXT NOT NULL CHECK(json_valid(payload) AND length(payload)<1000000),
 revision INTEGER NOT NULL DEFAULT 1,
 quote_number INTEGER,
 deleted INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(kind,id)
);
CREATE UNIQUE INDEX quote_numbers ON records(quote_number) WHERE kind='quote';
CREATE TABLE record_history(
 kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,
 quote_number INTEGER,deleted INTEGER NOT NULL,updated_at TEXT NOT NULL,
 PRIMARY KEY(kind,id,revision)
);
CREATE TRIGGER keep_record_history BEFORE UPDATE ON records BEGIN
 INSERT INTO record_history VALUES(old.kind,old.id,old.revision,old.payload,old.quote_number,old.deleted,old.updated_at);
END;
CREATE INDEX records_listing ON records(kind,deleted,updated_at);
CREATE TABLE files(
 client_id TEXT NOT NULL,file_key TEXT NOT NULL,object_id TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,content_type TEXT NOT NULL,size INTEGER NOT NULL,
 revision INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(client_id,file_key)
);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,config_version TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE login_attempts(bucket TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);

CREATE TABLE storage_budget(id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL);
INSERT INTO storage_budget VALUES(1,0);
