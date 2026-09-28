"""Domain services: the only modules that hold business rules.

Services are the only callers of ``SurrealClient``; routers only translate tRPC
procedure names into service calls and map errors to codes.
"""
