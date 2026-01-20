from sqlalchemy import create_engine, text

# Format: postgresql://user:password@localhost:port/dbname
DATABASE_URL = "postgresql://admin:Jur54321low@localhost:5432/juris_flow"

engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT version();"))
        print(f"Connection Successful! Postgres Version: {result.fetchone()[0]}")
except Exception as e:
    print(f"Connection Failed: {e}")