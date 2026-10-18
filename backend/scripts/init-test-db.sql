-- Runs once, when the Postgres container is first created: a separate database for pytest.
CREATE DATABASE fittrack_test OWNER fittrack;
