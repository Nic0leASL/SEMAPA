import os
import logging
from cassandra.cluster import Cluster
from cassandra.auth import PlainTextAuthProvider

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("CassandraConnection")

class CassandraConnection:
    _cluster = None
    _session = None

    @classmethod
    def get_session(cls):
        if cls._session is None or cls._session.is_shutdown:
            cls.initialize()
        return cls._session

    @classmethod
    def initialize(cls):
        contact_points_str = os.getenv("CASSANDRA_CONTACT_POINTS", "127.0.0.1")
        contact_points = [ip.strip() for ip in contact_points_str.split(",")]
        port = int(os.getenv("CASSANDRA_PORT", 9042))
        
        # Supporting auth if env variables exist
        username = os.getenv("CASSANDRA_USER")
        password = os.getenv("CASSANDRA_PASSWORD")
        auth_provider = None
        if username and password:
            auth_provider = PlainTextAuthProvider(username=username, password=password)

        logger.info(f"Connecting to Cassandra at {contact_points}:{port}...")
        try:
            cls._cluster = Cluster(
                contact_points=contact_points,
                port=port,
                auth_provider=auth_provider,
                connect_timeout=20.0
            )
            # Connect without keyspace first to ensure we can create it
            cls._session = cls._cluster.connect()
            logger.info("Cassandra connection established successfully.")
            cls.init_schema()
        except Exception as e:
            logger.error(f"Failed to connect to Cassandra cluster: {e}")
            raise e

    @classmethod
    def init_schema(cls):
        logger.info("Initializing Cassandra schema...")
        cql_path = os.path.join(os.path.dirname(__file__), "schema.cql")
        if not os.path.exists(cql_path):
            logger.error(f"CQL schema file not found at {cql_path}")
            return
            
        try:
            with open(cql_path, "r", encoding="utf-8") as f:
                cql_content = f.read()

            # Simple parser to remove comments and split statements
            statements = []
            current_statement = []
            
            for line in cql_content.splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith("--"):
                    continue
                current_statement.append(line)
                if stripped.endswith(";"):
                    statements.append("\n".join(current_statement))
                    current_statement = []

            logger.info(f"Executing {len(statements)} schema statements...")
            for statement in statements:
                try:
                    cls._session.execute(statement)
                except Exception as stmt_err:
                    # Ignore keyspace creation errors if already present or similar non-critical issues
                    if "already exists" not in str(stmt_err).lower():
                        logger.warning(f"Error executing statement: {stmt_err}")
            
            # Set session keyspace to semapa
            cls._session.set_keyspace("semapa")
            logger.info("Cassandra schema initialized and keyspace set to 'semapa'.")
        except Exception as e:
            logger.error(f"Error during schema initialization: {e}")
            raise e

    @classmethod
    def close(cls):
        if cls._session:
            try:
                cls._session.shutdown()
                logger.info("Cassandra session closed.")
            except Exception as e:
                logger.warning(f"Error shutting down session: {e}")
            cls._session = None
            
        if cls._cluster:
            try:
                cls._cluster.shutdown()
                logger.info("Cassandra cluster connection closed.")
            except Exception as e:
                logger.warning(f"Error shutting down cluster: {e}")
            cls._cluster = None
