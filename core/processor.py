from gliner import GLiNER
class LegalProcessor:

    cases = []
    global_gliner = GLiNER.from_pretrained("urchade/gliner_small-v2.1")

    def __init__(self, case_id: int, db_session):
        self.case_id = case_id
        self.db = db_session
        self.cpp_masker = juris_core.PiiMasker()
        self.gliner_map = {}
        LegalProcessor.cases.append(self)

    def redact_pii_from_text(self, text: str) -> str:
        """
        Redact PII from the given text: 
            1) C++ Engine cleans up patterns (Email, Phone, SSN)
            2) GLiNER finds context-dependent PII like names and organizations.
        """
        #C++ Engine Redaction
        masked_text = self.cpp_masker.mask_sensitive_pii(text)

        #GLiNER Redaction
        labels = ['person', 'organization']
        entities = global_gliner.predict_entities(masked_text, labels=labels, threshold=0.5)

        entities = sorted(entities, key=lambda x: x['start'], reverse=True)
        final_text = masked_text
        for ent in entities:
            original_name = ent['text']
            label = ent['label'].upper()

            #TODO: handle the case where we check DB for an existing token already
            token = f'[{label}_{len(self.gliner_map)+ 1}]'

            self.gliner_map[original_name] = {
                'token': token,
                'type': label
            }
            start, end = ent['start'], ent['end']
            final_text = final_text[:start] + token + final_text[end:]

        return final_text

    def commit_to_db(self):
        """Merges C++ vault and GLiNER vault, then saves to Postgres DB"""
        cpp_vault = self.cpp_masker.get_map()

        for original, token in cpp_vault.items():
            entity_type = token[1:].split('_')[0]
            self._save_single_entity(original, token, entity_type)

        for original, data in self.gliner_map.items():
            self._save_single_entity(original, data['token'], data['type'])

        try:
            self.db.commit()
            print(f"Successfully committed token vault for Case {self.case_id} to database.")
        except Exception as e:
            self.db.rollback()
            print(f"Error committing token vault for Case {self.case_id} to database: {e}")
    
    def _save_single_entity(self, original: str, token: str, type_: str):
        """Helper function to save a single entity to the database without crashing on duplicates"""

        exists = self.db.query(EntityMap).filter_by(
            case_id=self.case_id,
            original_value=original,
        ).first()

        if not exists:
            new_entry = EntityMap(
                case_id=self.case_id,
                original_value=original,
                token = token,
                entity_type = type_
            )
            self.db.add(new_entry)

    def get_token_vault(self):
        """Returns the combined token vault from C++ and GLiNER as a dictionary for debugging."""
        cpp_vault = self.cpp_masker.get_map()
        
        gliner_simple = {k: v['token'] for k, v in self.gliner_map.items()}
    
        return cpp_vault | gliner_simple