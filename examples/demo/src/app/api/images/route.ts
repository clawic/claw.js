import { NextRequest, NextResponse } from "next/server";
import { getClaw } from "@/lib/claw";
import { createE2EImage, isE2EEnabled, listE2EImagesFiltered } from "@/lib/e2e";

export async function GET(request: NextRequest) {
  if (isE2EEnabled()) {
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const status = url.searchParams.get("status");
    const backendId = url.searchParams.get("backendId");
    const query = url.searchParams.get("query");
    const operation = url.searchParams.get("operation");
    const imageType = url.searchParams.get("type");
    const provenance = url.searchParams.get("provenance");
    const tag = url.searchParams.get("tag");
    return NextResponse.json({
      images: listE2EImagesFiltered({
        limit: limit ? Number(limit) : undefined,
        status,
        backendId,
        query,
        operation,
        imageType,
        provenance,
        tag,
      }),
    });
  }

  try {
    const claw = await getClaw();
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const status = url.searchParams.get("status");
    const backendId = url.searchParams.get("backendId");
    const query = url.searchParams.get("query");
    const operation = url.searchParams.get("operation");
    const imageType = url.searchParams.get("type");
    const provenance = url.searchParams.get("provenance");
    const tag = url.searchParams.get("tag");

    const images = claw.image.list({
      ...(limit ? { limit: Number(limit) } : {}),
      ...(status === "succeeded" || status === "failed" ? { status } : {}),
      ...(backendId ? { backendId } : {}),
      ...(query ? { query } : {}),
      ...(operation === "create" || operation === "edit" || operation === "import" ? { operation } : {}),
      ...(imageType ? { imageType: imageType as never } : {}),
      ...(provenance ? { provenance: provenance as never } : {}),
      ...(tag ? { tag } : {}),
    });

    return NextResponse.json({ images });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (isE2EEnabled()) {
    const body = await request.json();
    const { prompt, backendId, model, title, type, tags, collections } = body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    return NextResponse.json({
      image: createE2EImage({
        prompt: prompt.trim(),
        backendId,
        model,
        title,
        type,
        tags,
        collections,
      }),
    });
  }

  try {
    const claw = await getClaw();
    const body = await request.json();
    const { prompt, backendId, model, metadata, title, type, tags, collections } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const record = await claw.image.create({
      prompt: prompt.trim(),
      ...(title ? { title } : {}),
      ...(backendId ? { backendId } : {}),
      ...(model ? { model } : {}),
      ...(metadata ? { metadata } : {}),
      ...(type ? { imageType: type } : {}),
      ...(Array.isArray(tags) ? { tags } : {}),
      ...(Array.isArray(collections) ? { collections } : {}),
    });

    return NextResponse.json({ image: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
