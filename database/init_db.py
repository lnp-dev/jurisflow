from sqlalchemy import create_engine
from models import Base

# 1. Connection String 
# Format: postgresql://user:password@localhost:port/dbname
DATABASE_URL = "postgresql://admin:Jur54321low@localhost:5432/juris_flow"

def init_db():
    print("Connecting to Docker Database...")
    engine = create_engine(DATABASE_URL)
    
    print("Building Tables (Cases, Documents, EntityMap)...")
    #looks at models.py and creates the actual tables in Postgres
    Base.metadata.create_all(bind=engine)
    
    print("Success! Database Schema Created.")

if __name__ == "__main__":
    init_db()