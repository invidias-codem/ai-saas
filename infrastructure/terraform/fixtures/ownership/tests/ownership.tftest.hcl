run "sandbox_ownership" {
  command = plan

  assert {
    condition     = output.ownership.environment == "sandbox"
    error_message = "The fixture must remain sandbox scoped."
  }

  assert {
    condition     = output.ownership.management_plane == "terraform" && output.ownership.runtime_owner == "lattice-execution-plane"
    error_message = "Durable infrastructure and dynamic runtime ownership must remain distinct."
  }

  assert {
    condition     = output.ownership.cloud_mutations == false
    error_message = "The fixture must not advertise live cloud mutations."
  }
}

run "reject_production" {
  command = plan

  variables {
    environment = "production"
  }

  expect_failures = [var.environment]
}

run "reject_staging" {
  command = plan

  variables {
    environment = "staging"
  }

  expect_failures = [var.environment]
}
