import logging
from fastapi                    import APIRouter, HTTPException, Depends, status, Request
from auth                       import getCurrentUser, currentUser
from typing                     import List, Dict, Any

log = logging.getLogger(__name__)
router = APIRouter()

@router.get("/files")
async def get_files(request: Request, user: currentUser = Depends(getCurrentUser))->List[Dict]:
    """
    Fetch all files uploaded by the current user from the storage bucket.
    """
    log.info(f"Fetching files from bucket for user: {user.id}")

    supabaseClient = request.app.state.supabase_client

    if supabaseClient is None:
        log.error("CRITICAL: supabase_client is None in get_files! Lifespan initialization failed or has not run.")
        raise HTTPException(status_code=500, detail="Backend storage client not initialized")
    
    try:
        # The files are stored in the 'docs' bucket under the path '{user_id}/...'
        # We list all files in the folder corresponding to the user's ID
        response = await supabaseClient.table('documents').select('file_id','file_name').eq("user_id", user.id).execute()
        result:List[Dict]=[]        
        for item in response.data:
            entry = {
                "id":item['file_id'],
                "name":item['file_name'],
            }
            if entry not in result:
                result.append(entry)
        return result

    except Exception as e:
        log.error(f"Error fetching files from bucket: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Could not retrieve files from storage: {str(e)}"
        )

@router.delete("/files/{file_id}")
async def delete_file(file_id: str, request: Request, user: currentUser = Depends(getCurrentUser)):
    """
    Delete a specific file for the authenticated user.
    """
    supabaseClient = request.app.state.supabase_client

    if supabaseClient is None:
        log.error("CRITICAL: supabase_client is None in delete_file! Lifespan initialization failed or has not run.")
        raise HTTPException(status_code=500, detail="Backend storage client not initialized")

    try:
        # get the filename from the documents table
        response_1 = await supabaseClient.table("documents").select("file_name").eq("file_id", file_id).execute()
        
        file_name:str = ""
        file_name = response_1.data[0]['file_name']
        
        # delete from the storage
        try:
            response_2 = await supabaseClient.storage.from_('docs').remove([f"{user.id}/{file_id}/{file_name}"])
        except Exception as e:
            log.info(f"    ERROR Occured: {e}")
                
        # Delete from metadata table
        try:
            response_3 = await supabaseClient.table("documents").delete().eq("file_id", file_id).execute()
            log.info(f"    Metadata deleted from documents table")
        except Exception as e:
            log.error(f"    ERROR Occured: {e}")
        
        return {"message": "File deleted successfully"}
    
    except Exception as e:
        log.error(f"Error deleting file {file_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
