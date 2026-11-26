mock_provider "google" {}

variables {
  project_id              = "lattice-iac-sandbox-test"
  location                = "US-EAST1"
  state_writer_account_id = "tf-state-writer"
}

run "protected_bucket" {
  command = plan

  assert {
    condition     = google_storage_bucket.state.public_access_prevention == "enforced" && google_storage_bucket.state.uniform_bucket_level_access
    error_message = "The bucket must reject public access and object ACLs."
  }

  assert {
    condition     = one(google_storage_bucket.state.versioning).enabled && !google_storage_bucket.state.force_destroy
    error_message = "Versioning must be enabled and destructive emptying disabled."
  }

  assert {
    condition     = google_storage_bucket.state.project == var.project_id && google_storage_bucket.state.name == "${var.project_id}-tfstate"
    error_message = "The state bucket must target the approved sandbox project."
  }

  assert {
    condition     = google_storage_bucket_iam_member.state_writer.role == "roles/storage.objectAdmin" && google_storage_bucket_iam_member.state_writer.member == "serviceAccount:${var.state_writer_account_id}@${var.project_id}.iam.gserviceaccount.com"
    error_message = "Grant object access only to the dedicated same-project service account."
  }
}

run "reject_production_project" {
  command = plan

  variables {
    project_id = "lattice-production"
  }

  expect_failures = [var.project_id]
}

run "reject_unapproved_region" {
  command = plan

  variables {
    location = "EU"
  }

  expect_failures = [var.location]
}

run "reject_external_principal" {
  command = plan

  variables {
    state_writer_account_id = "external@example.com"
  }

  expect_failures = [var.state_writer_account_id]
}
