docker exec -it walicho-backend-1 bash -c "PYTHONPATH=/ python -m app.scripts.create_admin"

docker exec -it walicho-backend-1 bash -c "PYTHONPATH=/ python -m app.scripts.import_geojson"

docker exec -it walicho-backend-1 bash -c "PYTHONPATH=/ python -m app.scripts.import_circuitos"