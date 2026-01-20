from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func

# The base class for all models
Base = declarative_base()

class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # e.g., "The Enron Fraud Investigation"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    documents = relationship("Document", back_populates="case")
    entity_maps = relationship("EntityMap", back_populates="case")

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    filename = Column(String, nullable=False)
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    original_text = Column(Text)
    redacted_text = Column(Text)
    status = Column(String, default='processing')
    # Relationship back to the Case
    case = relationship("Case", back_populates="documents")

class EntityMap(Base):
    """
    The 'Vault'.
    Stores the mapping between real data and tokens.
    Scoped by Case ID so data doesn't leak between clients.
    """
    __tablename__ = "entity_map"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    
    original_value = Column(Text, nullable=False) # e.g., "John Smith"
    token = Column(String, nullable=False)        # e.g., "{{PERSON_1}}"
    entity_type = Column(String, nullable=False)  # e.g., "PERSON", "EMAIL"

    # Relationship back to the Case
    case = relationship("Case", back_populates="entity_maps")

    # CONSTRAINT: Ensure we don't map "John Smith" twice inside the same case.
    # This enforces the "Single Source of Truth."
    __table_args__ = (
        UniqueConstraint('case_id', 'original_value', name='unique_entity_per_case'),
    )