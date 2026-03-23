from neo4j import GraphDatabase
from app.core.config import settings

class Neo4jConnection:
    def __init__(self, uri, user, pwd):
        self.driver = GraphDatabase.driver(uri, auth=(user, pwd))

    def close(self):
        if self.driver:
            self.driver.close()

    def get_session(self):
        return self.driver.session()

neo4j_conn = Neo4jConnection(settings.NEO4J_URI, settings.NEO4J_USER, settings.NEO4J_PASSWORD)

def get_neo4j_session():
    session = neo4j_conn.get_session()
    try:
        yield session
    finally:
        session.close()
